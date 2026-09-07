import NodeCache from 'node-cache';
import crypto from 'crypto';

// useClones:false would hand out shared mutable references; keep cloning on.
const cache = new NodeCache({ stdTTL: 300, maxKeys: 5000 });

export class CacheService {
  get<T>(key: string): T | undefined {
    return cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): void {
    if (ttl !== undefined) {
      cache.set(key, value, ttl);
    } else {
      cache.set(key, value);
    }
  }

  del(key: string): void {
    cache.del(key);
  }

  flush(): void {
    cache.flushAll();
  }

  cacheKey(parts: string[]): string {
    return parts.join(':');
  }

  /**
   * Derives a stable, non-reversible per-user cache namespace from an access
   * token. Using a raw token substring as a cache key both leaks token material
   * into cache state and collides across users, which can serve one user's
   * private repository data to another.
   */
  userScope(accessToken: string): string {
    return crypto
      .createHash('sha256')
      .update(accessToken)
      .digest('hex')
      .slice(0, 32);
  }
}

export const cacheService = new CacheService();
