import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { GitHubService } from '../services/github.service.js';
import { cacheService } from '../services/cache.service.js';

const router = Router();

router.use(requireAuth);

function getGitHubService(req: Request): GitHubService {
  return new GitHubService(req.session.accessToken!);
}

// Per-user cache namespace: GitHub responses depend on the caller's grants, so
// a shared key can serve private org data to a user who cannot see it.
function scope(req: Request): string {
  return cacheService.userScope(req.session.accessToken!);
}

function str(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

// Bounds user-controlled pagination so a request cannot ask for an unbounded
// page size and amplify load against the GitHub API.
function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// GET /api/orgs - list user organizations
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const cacheKey = cacheService.cacheKey(['orgs', scope(req)]);
  const cached = cacheService.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const service = getGitHubService(req);
    const orgs = await service.getUserOrgs();
    cacheService.set(cacheKey, orgs, 300);
    res.json(orgs);
  } catch (err) {
    console.error('Get orgs error:', err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// GET /api/orgs/:org/repos?page=1&per_page=30 - paginated org repos
router.get('/:org/repos', async (req: Request, res: Response): Promise<void> => {
  const org = str(req.params['org']);
  const page = clampInt(req.query.page, 1, 1, 1000);
  const perPage = clampInt(req.query.per_page, 30, 1, 100);

  const cacheKey = cacheService.cacheKey(['org-repos', scope(req), org, String(page), String(perPage)]);
  const cached = cacheService.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const service = getGitHubService(req);
    const data = await service.getOrgRepos(org, page, perPage);
    cacheService.set(cacheKey, data, 120);
    res.json(data);
  } catch (err) {
    console.error('Get org repos error:', err);
    res.status(500).json({ error: 'Failed to fetch organization repositories' });
  }
});

export { router as orgRouter };
