import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { authRouter } from './routes/auth.routes.js';
import { repoRouter } from './routes/repo.routes.js';
import { orgRouter } from './routes/org.routes.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { GitHubService } from './services/github.service.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Never fall back to a hardcoded session secret in production: a known secret
// lets anyone forge session cookies and impersonate authenticated users.
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';
if (IS_PRODUCTION && SESSION_SECRET.length < 32) {
  throw new Error(
    'SESSION_SECRET must be set to at least 32 characters when NODE_ENV=production'
  );
}
const RESOLVED_SESSION_SECRET =
  SESSION_SECRET || 'dev-secret-change-in-production';

// Comma-separated allowlist; falls back to CLIENT_URL.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? CLIENT_URL)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Required so express-rate-limit and secure cookies see the real client IP /
// protocol behind a single reverse proxy. Not `true`, which trusts any hop.
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    // Explicit CSP without upgrade-insecure-requests so HTTP deployments keep
    // working, while still blocking injected script/object/frame sources.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
        connectSrc: ["'self'", 'https://api.github.com'],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'", 'https://github.com'],
      },
    },
    hsts: false, // Disable HSTS — we don't terminate TLS here
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  })
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / non-browser requests send no Origin header.
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

// Body parsing — bounded to avoid trivial memory-exhaustion DoS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate limiting: protects the upstream GitHub token from being burned by an
// attacker and limits brute-forcing of the OAuth endpoints.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// Session
app.use(
  session({
    secret: RESOLVED_SESSION_SECRET,
    name: 'gne.sid', // Avoid advertising the default connect.sid fingerprint
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Opt in via COOKIE_SECURE=true when behind a TLS-terminating proxy.
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax', // Must be 'lax' for OAuth redirect flow to work
    },
  })
);

// API routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/repos', apiLimiter, repoRouter);
app.use('/api/orgs', apiLimiter, orgRouter);

// GET /api/rate-limit — returns GitHub API rate limit (no cache)
app.get('/api/rate-limit', apiLimiter, requireAuth, async (req, res): Promise<void> => {
  try {
    const service = new GitHubService(req.session.accessToken!);
    const data = await service.getRateLimit();
    res.json(data);
  } catch (err) {
    console.error('Get rate limit error:', err);
    res.status(500).json({ error: 'Failed to fetch rate limit' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static client files in production
if (IS_PRODUCTION) {
  const clientDistPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  // Fallback: serve index.html for all non-API routes (SPA routing)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});

export default app;
