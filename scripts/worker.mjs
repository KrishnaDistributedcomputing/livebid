import pg from "pg";
import { createClient } from "redis";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error("DATABASE_URL and REDIS_URL are required");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 5,
  application_name: "livebid-worker",
});
const redis = createClient({ url: redisUrl });
redis.on("error", (error) => console.error("Worker Redis error", error));
await redis.connect();

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function activateScheduledAuctions() {
  await pool.query(
    `UPDATE auctions
     SET status = 'ACTIVE', updated_at = now()
     WHERE status = 'SCHEDULED' AND starts_at <= now() AND ends_at > now()`,
  );
}

async function finalizeAuctions() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT a.id, a.product_id, a.seller_id, a.highest_bidder_id,
         a.current_price_minor, a.currency, p.title
       FROM auctions a
       JOIN products p ON p.id = a.product_id
       WHERE a.status = 'ACTIVE' AND a.ends_at <= now()
       ORDER BY a.ends_at
       FOR UPDATE OF a SKIP LOCKED
       LIMIT 20`,
    );

    for (const auction of result.rows) {
      let orderId = null;
      if (auction.highest_bidder_id) {
        const order = await client.query(
          `INSERT INTO orders (
             buyer_id, seller_id, auction_id, currency, subtotal_minor,
             total_minor, payment_status
           )
           VALUES ($1, $2, $3, $4, $5, $5, 'NOT_REQUIRED')
           ON CONFLICT (auction_id) DO UPDATE SET updated_at = orders.updated_at
           RETURNING id`,
          [
            auction.highest_bidder_id,
            auction.seller_id,
            auction.id,
            auction.currency,
            auction.current_price_minor,
          ],
        );
        orderId = order.rows[0].id;
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, title_snapshot, quantity, unit_price_minor
           )
           SELECT $1, $2, $3, 1, $4
           WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = $1)`,
          [orderId, auction.product_id, auction.title, auction.current_price_minor],
        );
        await client.query(
          `UPDATE products
           SET quantity = greatest(0, quantity - 1),
             status = CASE WHEN quantity - 1 <= 0 THEN 'SOLD' ELSE status END,
             updated_at = now()
           WHERE id = $1`,
          [auction.product_id],
        );
      }

      await client.query(
        `UPDATE auctions
         SET status = 'COMPLETED', version = version + 1, updated_at = now()
         WHERE id = $1`,
        [auction.id],
      );
      await client.query(
        `INSERT INTO outbox_events (
           aggregate_type, aggregate_id, event_type, payload
         )
         VALUES ('auction', $1, 'auction.completed', $2)`,
        [
          auction.id,
          JSON.stringify({
            event: "auction.completed",
            auctionId: auction.id,
            winnerId: auction.highest_bidder_id,
            orderId,
            finalPriceMinor: auction.current_price_minor,
            currency: auction.currency,
          }),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function publishOutbox() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, event_type, payload
       FROM outbox_events
       WHERE published_at IS NULL AND available_at <= now()
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 100`,
    );

    for (const event of result.rows) {
      try {
        await redis.publish("livebid:events", JSON.stringify(event.payload));
        await client.query(
          `UPDATE outbox_events
           SET published_at = now(), attempts = attempts + 1, last_error = NULL
           WHERE id = $1`,
          [event.id],
        );
      } catch (error) {
        await client.query(
          `UPDATE outbox_events
           SET attempts = attempts + 1,
             available_at = now() + make_interval(secs => least(300, power(2, attempts + 1)::integer)),
             last_error = left($2, 1000)
           WHERE id = $1`,
          [event.id, error instanceof Error ? error.message : String(error)],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runMaintenance() {
  await pool.query("DELETE FROM sessions WHERE expires_at <= now()");
  await activateScheduledAuctions();
  await finalizeAuctions();
  await publishOutbox();
}

console.log("LiveBid worker started");
while (!stopping) {
  try {
    await runMaintenance();
  } catch (error) {
    console.error("Worker cycle failed", error);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

await redis.quit();
await pool.end();
console.log("LiveBid worker stopped");
