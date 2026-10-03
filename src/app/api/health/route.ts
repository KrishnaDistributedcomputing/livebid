import { getPool } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { database: false, redis: false };
  try {
    await getPool().query("SELECT 1");
    checks.database = true;
    const redis = await getRedis();
    checks.redis = (await redis.ping()) === "PONG";
    return Response.json({
      status: "ok",
      service: "livebid-web",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json(
      {
        status: "unhealthy",
        service: "livebid-web",
        checks,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}