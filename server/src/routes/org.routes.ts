import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { GitHubService } from '../services/github.service.js';
import { cacheService } from '../services/cache.service.js';

const router = Router();

router.use(requireAuth);

function getGitHubService(req: Request): GitHubService {
  return new GitHubService(req.session.accessToken!);
}

function str(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

// GET /api/orgs - list user organizations
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const cacheKey = cacheService.cacheKey(['orgs', req.session.accessToken!.slice(-8)]);
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
  const page = parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10) || 1;
  const perPage = parseInt(typeof req.query.per_page === 'string' ? req.query.per_page : '30', 10) || 30;

  const cacheKey = cacheService.cacheKey(['org-repos', org, String(page), String(perPage)]);
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
