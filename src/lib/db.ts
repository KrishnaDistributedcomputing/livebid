import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";

const globalDatabase = globalThis as typeof globalThis & {
  liveBidPool?: Pool;
};

export function getPool() {
  if (globalDatabase.liveBidPool) return globalDatabase.liveBidPool;
  const env = getEnv();
  const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "livebid-web",
    });
  if (env.NODE_ENV !== "production") {
    globalDatabase.liveBidPool = pool;
  }
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
) {
  return getPool().query<T>(text, [...values]);
}

export async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
