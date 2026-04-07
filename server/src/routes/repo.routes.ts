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

// GET /api/repos - list user repos
router.get('/', async (req: Request, res: Response): Promise<void> => {
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

    const cacheKey = cacheService.cacheKey([
      'commits',
      owner,
      repo,
      branch,
      cursor ?? 'start',
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
        cursor
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
router.get(
  '/:owner/:repo/code-frequency',
  async (req: Request, res: Response): Promise<void> => {
    const owner = str(req.params['owner']);
    const repo = str(req.params['repo']);
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const until = typeof req.query.until === 'string' ? req.query.until : undefined;
    const path = typeof req.query.path === 'string' ? req.query.path : undefined;
    const maxCommits = typeof req.query.maxCommits === 'string' ? parseInt(req.query.maxCommits, 10) : undefined;

    const cacheKey = cacheService.cacheKey(['code-frequency', owner, repo, path ?? '', since ?? '', until ?? '', String(maxCommits ?? 300)]);
    const cached = cacheService.get(cacheKey);
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
  }
);

export { router as repoRouter };
