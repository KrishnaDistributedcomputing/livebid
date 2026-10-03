import type { QueryResultRow } from "pg";
import { json, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

type SummaryRow = QueryResultRow & {
  users: number;
  activeUsers: number;
  suspendedUsers: number;
  sellers: number;
  products: number;
  liveShows: number;
  activeAuctions: number;
  orders: number;
  orderValueMinor: number;
  pendingOutboxEvents: number;
};

export const GET = withApiErrors(async () => {
  await requireUser(["ADMIN"]);
  const result = await query<SummaryRow>(
    `SELECT
       (SELECT count(*)::integer FROM users) AS users,
       (SELECT count(*)::integer FROM users WHERE status = 'ACTIVE') AS "activeUsers",
       (SELECT count(*)::integer FROM users WHERE status = 'SUSPENDED') AS "suspendedUsers",
       (SELECT count(*)::integer FROM seller_profiles) AS sellers,
       (SELECT count(*)::integer FROM products) AS products,
       (SELECT count(*)::integer FROM shows WHERE status = 'LIVE') AS "liveShows",
       (SELECT count(*)::integer FROM auctions WHERE status = 'ACTIVE') AS "activeAuctions",
       (SELECT count(*)::integer FROM orders) AS orders,
       (SELECT coalesce(sum(total_minor), 0)::integer FROM orders) AS "orderValueMinor",
       (SELECT count(*)::integer FROM outbox_events WHERE published_at IS NULL)
         AS "pendingOutboxEvents"`,
  );
  return json({ summary: result.rows[0] });
});
