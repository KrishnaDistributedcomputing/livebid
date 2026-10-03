import type { QueryResultRow } from "pg";
import { ApiError, json, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

type ResourceRow = QueryResultRow & Record<string, unknown>;

const resourceQueries = {
  products: `SELECT p.id, p.title, p.category, p.condition, p.status, p.currency,
      p.buy_now_price_minor AS "buyNowPriceMinor", p.quantity,
      s.display_name AS seller, p.created_at AS "createdAt"
    FROM products p
    JOIN seller_profiles s ON s.id = p.seller_id
    ORDER BY p.created_at DESC LIMIT 200`,
  shows: `SELECT sh.id, sh.title, sh.status, sh.scheduled_at AS "scheduledAt",
      sh.started_at AS "startedAt", sh.ended_at AS "endedAt",
      s.display_name AS seller
    FROM shows sh
    JOIN seller_profiles s ON s.id = sh.seller_id
    ORDER BY sh.created_at DESC LIMIT 200`,
  auctions: `SELECT a.id, p.title AS product, s.display_name AS seller,
      a.status, a.currency, a.current_price_minor AS "currentPriceMinor",
      a.sequence, a.starts_at AS "startsAt", a.ends_at AS "endsAt"
    FROM auctions a
    JOIN products p ON p.id = a.product_id
    JOIN seller_profiles s ON s.id = a.seller_id
    ORDER BY a.created_at DESC LIMIT 200`,
  orders: `SELECT o.id, buyer.username AS buyer, seller.display_name AS seller,
      o.currency, o.total_minor AS "totalMinor",
      o.payment_status AS "paymentStatus",
      o.fulfillment_status AS "fulfillmentStatus",
      o.created_at AS "createdAt"
    FROM orders o
    JOIN users buyer ON buyer.id = o.buyer_id
    JOIN seller_profiles seller ON seller.id = o.seller_id
    ORDER BY o.created_at DESC LIMIT 200`,
} as const;

export const GET = withApiErrors(async (request: Request) => {
  await requireUser(["ADMIN"]);
  const type = new URL(request.url).searchParams.get("type") ?? "";
  if (!(type in resourceQueries)) {
    throw new ApiError(400, "INVALID_RESOURCE", "The requested resource type is invalid.");
  }
  const queryText = resourceQueries[type as keyof typeof resourceQueries];
  const result = await query<ResourceRow>(queryText);
  return json({ type, items: result.rows });
});
