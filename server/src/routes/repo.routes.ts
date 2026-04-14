import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { GitHubService } from '../services/github.service.js';
import { cacheService } from '../services/cache.service.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

function getGitHubService(req: Request): GitHubService {
  return new GitHubService(req.session.accessToken!);
}

function str(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

// GET /api/repos - list user repos (supports ?page=1&per_page=30 for paginated ReposPage response)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const pageParam = typeof req.query.page === 'string' ? req.query.page : undefined;
  const perPageParam = typeof req.query.per_page === 'string' ? req.query.per_page : undefined;

  if (pageParam !== undefined || perPageParam !== undefined) {
    const page = parseInt(pageParam ?? '1', 10) || 1;
    const perPage = parseInt(perPageParam ?? '30', 10) || 30;
    const cacheKey = cacheService.cacheKey(['repos-paged', req.session.accessToken!.slice(-8), String(page), String(perPage)]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    try {
      const service = getGitHubService(req);
      const data = await service.getUserOwnRepos(page, perPage);
      cacheService.set(cacheKey, data, 120);
      res.json(data);
    } catch (err) {
      console.error('Get repos error:', err);
      res.status(500).json({ error: 'Failed to fetch repositories' });
    }
    return;
  }

  const cacheKey = cacheService.cacheKey([
    'repos',
    req.session.accessToken!.slice(-8),
  ]);
  const cached = cacheService.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const service = getGitHubService(req);
    const repos = await service.getUserRepos();
    cacheService.set(cacheKey, repos, 120);
    res.json(repos);
  } catch (err) {
    console.error('Get repos error:', err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// GET /api/repos/:owner/:repo/overview
router.get(
  '/:owner/:repo/overview',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const cacheKey = cacheService.cacheKey(['overview', owner, repo]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const overview = await service.getRepoOverview(owner, repo);
      cacheService.set(cacheKey, overview);
      res.json(overview);
    } catch (err) {
      console.error('Get overview error:', err);
      res.status(500).json({ error: 'Failed to fetch repository overview' });
    }
  }
);

// GET /api/repos/:owner/:repo/commits/:branch
router.get(
  '/:owner/:repo/commits/:branch',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const branch = str(req.params['branch']);
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const until = typeof req.query.until === 'string' ? req.query.until : undefined;

    const cacheKey = cacheService.cacheKey([
      'commits',
      owner,
      repo,
      branch,
      cursor ?? 'start',
      since ?? '',
      until ?? '',
    ]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const commits = await service.getBranchCommits(
        owner,
        repo,
        branch,
        cursor,
        since,
        until
      );
      cacheService.set(cacheKey, commits);
      res.json(commits);
    } catch (err) {
      console.error('Get commits error:', err);
      res.status(500).json({ error: 'Failed to fetch commits' });
    }
  }
);

// GET /api/repos/:owner/:repo/commit/:sha
router.get(
  '/:owner/:repo/commit/:sha',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const sha = str(req.params['sha']);
    const cacheKey = cacheService.cacheKey(['commit', owner, repo, sha]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const commit = await service.getCommitDetail(owner, repo, sha);
      if (!commit) {
        res.status(404).json({ error: 'Commit not found' });
        return;
      }
      cacheService.set(cacheKey, commit, 600);
      res.json(commit);
    } catch (err) {
      console.error('Get commit detail error:', err);
      res.status(500).json({ error: 'Failed to fetch commit detail' });
    }
  }
);

// GET /api/repos/:owner/:repo/branches
router.get(
  '/:owner/:repo/branches',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const cacheKey = cacheService.cacheKey(['branches', owner, repo]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const branches = await service.getBranches(owner, repo);
      cacheService.set(cacheKey, branches, 120);
      res.json(branches);
    } catch (err) {
      console.error('Get branches error:', err);
      res.status(500).json({ error: 'Failed to fetch branches' });
    }
  }
);

// GET /api/repos/:owner/:repo/pulls
router.get(
  '/:owner/:repo/pulls',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const state =
      typeof req.query.state === 'string' ? req.query.state : 'OPEN';

    const cacheKey = cacheService.cacheKey(['pulls', owner, repo, state]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const pulls = await service.getPullRequests(owner, repo, state);
      cacheService.set(cacheKey, pulls, 120);
      res.json(pulls);
    } catch (err) {
      console.error('Get PRs error:', err);
      res.status(500).json({ error: 'Failed to fetch pull requests' });
    }
  }
);

// GET /api/repos/:owner/:repo/code-frequency
// Supports ?stream=1 for Server-Sent Events (SSE) streaming with incremental progress.
// Without ?stream=1, behaves as before (JSON response, cached).
router.get(
  '/:owner/:repo/code-frequency',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const until = typeof req.query.until === 'string' ? req.query.until : undefined;
    const path = typeof req.query.path === 'string' ? req.query.path : undefined;
    const maxCommits = typeof req.query.maxCommits === 'string' ? parseInt(req.query.maxCommits, 10) : undefined;
    const stream = req.query.stream === '1';

    const cacheKey = cacheService.cacheKey(['code-frequency', owner, repo, path ?? '', since ?? '', until ?? '', String(maxCommits ?? 100)]);
    const cached = cacheService.get(cacheKey);

    // ── Non-streaming path (backwards compatible) ──────────────────────────
    if (!stream) {
      if (cached) {
        res.json(cached);
        return;
      }
      try {
        const service = getGitHubService(req);
        const data = await service.getCodeFrequency(owner, repo, { since, until, path, maxCommits });
        cacheService.set(cacheKey, data, 300);
        res.json(data);
      } catch (err) {
        console.error('Get code frequency error:', err);
        res.status(500).json({ error: 'Failed to fetch code frequency data' });
      }
      return;
    }

    // ── SSE streaming path ─────────────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    function sendEvent(data: object) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    }

    // Cache hit: send complete event immediately
    if (cached) {
      sendEvent({ phase: 'complete', data: cached });
      res.end();
      return;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const service = getGitHubService(req);
      const finalData = await service.getCodeFrequencyWithProgress(
        owner,
        repo,
        { since, until, path, maxCommits },
        (progress) => {
          sendEvent({
            phase: progress.phase,
            loaded: progress.loaded,
            total: progress.total,
            partialData: progress.partialData,
          });
        },
        controller.signal
      );

      if (!controller.signal.aborted) {
        cacheService.set(cacheKey, finalData, 300);
      }
      sendEvent({ phase: 'complete', data: finalData });
      res.end();
    } catch (err) {
      console.error('Get code frequency stream error:', err);
      sendEvent({ phase: 'error', error: 'Failed to fetch code frequency data' });
      res.end();
    }
  }
);

export { router as repoRouter };
