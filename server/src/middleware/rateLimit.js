import { ApiError } from './errorMiddleware.js';

// Small fixed-window limiter for the unauthenticated credential endpoints. Kept in
// memory because the deployment target is a single API instance; a shared store would
// be required before running more than one process behind a load balancer.
export function createRateLimiter({
  windowMs = 15 * 60_000,
  max = 20,
  message = 'Too many attempts. Wait a few minutes and try again.',
} = {}) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  sweep.unref?.();

  function middleware(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
      next(new ApiError(429, message));
      return;
    }

    next();
  }

  middleware.dispose = () => clearInterval(sweep);
  return middleware;
}
