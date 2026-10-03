import { createClient, type RedisClientType } from "redis";
import { getEnv } from "@/lib/env";

const globalRedis = globalThis as typeof globalThis & {
  liveBidRedis?: RedisClientType;
};

function getClient() {
  if (globalRedis.liveBidRedis) return globalRedis.liveBidRedis;
  const env = getEnv();
  const client = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
      },
    });
  client.on("error", (error) => {
    console.error("Redis connection error", error);
  });
  if (env.NODE_ENV !== "production") {
    globalRedis.liveBidRedis = client;
  }
  return client;
}

export async function getRedis() {
  const redis = getClient();
  if (!redis.isOpen) {
    await redis.connect();
  }
  return redis;
}
