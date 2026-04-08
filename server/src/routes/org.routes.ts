import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { GitHubService } from '../services/github.service.js';
import { cacheService } from '../services/cache.service.js';

const router = Router();

router.use(requireAuth);

function getGitHubService(req: Request): GitHubService {
  return new GitHubService(req.session.accessToken!);
}

function num(param: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(param) ? param[0] : param;
  const parsed = parseInt(raw ?? '', 10);
  return isNaN(parsed) ? fallback : parsed;
}

// GET /api/orgs - list user's organizations
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const cacheKey = cacheService.cacheKey([
    'orgs',
    req.session.accessToken!.slice(-8),
  ]);
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

// GET /api/orgs/:org/repos?page=1&per_page=30 - paginated repos for an org
router.get(
  '/:org/repos',
  async (req: Request, res: Response): Promise<void> => {
    const org = Array.isArray(req.params['org'])
      ? req.params['org'][0]
      : req.params['org'] ?? '';
    const page = num(req.query.page as string | undefined, 1);
    const perPage = num(req.query.per_page as string | undefined, 30);

    const cacheKey = cacheService.cacheKey([
      'org-repos',
      org,
      String(page),
      String(perPage),
    ]);
    const cached = cacheService.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const service = getGitHubService(req);
      const result = await service.getOrgRepos(org, page, perPage);
      cacheService.set(cacheKey, result, 120);
      res.json(result);
    } catch (err) {
      console.error('Get org repos error:', err);
      res.status(500).json({ error: 'Failed to fetch organization repositories' });
    }
  }
);

export { router as orgRouter };
