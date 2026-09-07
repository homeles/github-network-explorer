import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

// POST /api/auth/github - initiate OAuth flow
router.post('/github', (req: Request, res: Response): void => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const clientId = process.env.GITHUB_CLIENT_ID ?? '';
  const redirectUri = `${process.env.SERVER_URL ?? 'http://localhost:3001'}/api/auth/callback`;
  const scope = 'repo read:user read:org';

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);

  res.json({ url: authUrl.toString() });
});

// GET /api/auth/callback - handle OAuth callback
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query;
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';

  if (!code || typeof code !== 'string') {
    res.redirect(`${clientUrl}?error=missing_code`);
    return;
  }

  const expectedState = req.session.oauthState;
  // Constant-time comparison; also rejects missing/non-string state outright so
  // a request with no prior /github call can never satisfy the CSRF check.
  if (
    typeof state !== 'string' ||
    typeof expectedState !== 'string' ||
    state.length !== expectedState.length ||
    !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
  ) {
    delete req.session.oauthState;
    res.redirect(`${clientUrl}?error=invalid_state`);
    return;
  }

  // Single-use state: prevents replaying a captured callback URL.
  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${process.env.SERVER_URL ?? 'http://localhost:3001'}/api/auth/callback`,
        }),
      }
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      res.redirect(`${clientUrl}?error=token_exchange_failed`);
      return;
    }

    // Regenerate the session ID on privilege change to defeat session fixation:
    // an attacker-planted pre-auth cookie must not become an authenticated one.
    const accessToken = tokenData.access_token;
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error:', regenErr);
        res.redirect(`${clientUrl}?error=server_error`);
        return;
      }
      req.session.accessToken = accessToken;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          res.redirect(`${clientUrl}?error=server_error`);
          return;
        }
        res.redirect(clientUrl);
      });
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${clientUrl}?error=server_error`);
  }
});

// GET /api/auth/status - check auth status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const token = req.session.accessToken;

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  try {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      req.session.accessToken = undefined;
      res.json({ authenticated: false });
      return;
    }

    const user = (await userResponse.json()) as {
      login: string;
      avatar_url: string;
      name: string | null;
    };

    res.json({
      authenticated: true,
      user: {
        login: user.login,
        avatarUrl: user.avatar_url,
        name: user.name,
      },
    });
  } catch (err) {
    console.error('Auth status error:', err);
    res.json({ authenticated: false });
  }
});

// POST /api/auth/logout - destroy session
router.post('/logout', (req: Request, res: Response): void => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    // Clear the cookie too, so a stale session id is not replayed.
    res.clearCookie('gne.sid');
    res.json({ success: true });
  });
});

export { router as authRouter };
