import type { IncomingMessage } from "node:http";
import { httpError } from "./errors.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  key?: string;
}

const buckets = new Map<string, Bucket>();
const DEFAULT_WINDOW_MS = 60 * 1000;

export function rateLimit(req: IncomingMessage, options: RateLimitOptions = {}): void {
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
    throw httpError(429, "Previse zahteva u kratkom periodu. Probaj ponovo za minut.");
  }
}

export function cleanupRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req: IncomingMessage): string {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  return forwardedFor.split(",")[0].trim() || req.socket.remoteAddress || "local";
}
