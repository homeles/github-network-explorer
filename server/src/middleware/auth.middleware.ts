import { Request, Response, NextFunction } from 'express';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session.accessToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
