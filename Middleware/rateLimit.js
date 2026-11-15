// Single-process limiter. Use a gateway/shared store for multi-instance deployments.
function rateLimit({ limit = 10, windowMs = 60000 } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, item] of clients) if (item.until <= now) clients.delete(key);
    const key = req.ip;
    const item = clients.get(key) || { count: 0, until: now + windowMs };
    item.count++; clients.set(key, item);
    if (item.count > limit) {
      res.set('Retry-After', String(Math.ceil((item.until - now) / 1000)));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Please wait before submitting again' } });
    }
    next();
  };
}
module.exports = { rateLimit };
