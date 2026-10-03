import { ApiError } from "@/lib/api";
import { getRedis } from "@/lib/redis";

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const client = await getRedis();
  const redisKey = `rate:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.expire(redisKey, windowSeconds);
  }
  if (count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.");
  }
}
