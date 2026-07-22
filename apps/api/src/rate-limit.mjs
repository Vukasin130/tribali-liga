const buckets = new Map();
const DEFAULT_WINDOW_MS = 60 * 1000;

export function rateLimit(req, options = {}) {
  const limit = options.limit || 120;
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const key = `${clientIp(req)}:${options.key || "default"}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const error = new Error("Previse zahteva u kratkom periodu. Probaj ponovo za minut.");
    error.statusCode = 429;
    throw error;
  }
}

export function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  return forwardedFor.split(",")[0].trim() || req.socket.remoteAddress || "local";
}
