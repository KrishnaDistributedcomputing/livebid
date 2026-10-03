import type { QueryResultRow } from "pg";
import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { orderSchema } from "@/lib/schemas";

type OrderRow = QueryResultRow & {
  id: string;
  buyerId: string;
  sellerId: string;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
};

export const GET = withApiErrors(async () => {
  const user = await requireUser();
  const result = await query<OrderRow>(
    `SELECT o.id, o.buyer_id AS "buyerId", o.seller_id AS "sellerId",
       o.currency, o.subtotal_minor AS "subtotalMinor",
       o.total_minor AS "totalMinor", o.payment_status AS "paymentStatus",
       o.fulfillment_status AS "fulfillmentStatus", o.created_at AS "createdAt"
     FROM orders o
     LEFT JOIN seller_profiles s ON s.id = o.seller_id
     WHERE o.buyer_id = $1 OR s.user_id = $1 OR $2 = 'ADMIN'
     ORDER BY o.created_at DESC
     LIMIT 100`,
    [user.id, user.role],
  );
  return json({ orders: result.rows });
});

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser(["BUYER", "ADMIN"]);
  const input = await parseJson(request, orderSchema);

  const order = await transaction(async (client) => {
    const productResult = await client.query<QueryResultRow & {
      id: string;
      seller_id: string;
      seller_user_id: string;
      title: string;
      currency: string;
      buy_now_price_minor: number | null;
      available_quantity: number;
    }>(
      `SELECT p.id, p.seller_id, s.user_id AS seller_user_id, p.title, p.currency,
         p.buy_now_price_minor, p.quantity - p.reserved_quantity AS available_quantity
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       WHERE p.id = $1
         AND p.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1
           FROM auctions a
           WHERE a.product_id = p.id
             AND a.status IN ('SCHEDULED', 'ACTIVE')
         )
       FOR UPDATE OF p`,
      [input.productId],
    );
    const product = productResult.rows[0];
    if (!product || !product.buy_now_price_minor) {
      throw new ApiError(404, "PRODUCT_NOT_PURCHASABLE", "The product is not available.");
    }
    if (product.seller_user_id === user.id) {
      throw new ApiError(403, "SELF_PURCHASE_FORBIDDEN", "Sellers cannot buy their own items.");
    }
    if (product.available_quantity < input.quantity) {
      throw new ApiError(409, "INSUFFICIENT_INVENTORY", "The requested quantity is unavailable.");
    }

    const subtotal = product.buy_now_price_minor * input.quantity;
    const result = await client.query<OrderRow>(
      `INSERT INTO orders (
         buyer_id, seller_id, currency, subtotal_minor, total_minor, payment_status
       )
       VALUES ($1, $2, $3, $4, $4, 'NOT_REQUIRED')
       RETURNING id, buyer_id AS "buyerId", seller_id AS "sellerId", currency,
         subtotal_minor AS "subtotalMinor", total_minor AS "totalMinor",
         payment_status AS "paymentStatus",
         fulfillment_status AS "fulfillmentStatus", created_at AS "createdAt"`,
      [user.id, product.seller_id, product.currency, subtotal],
    );
    const row = result.rows[0];
    await client.query(
      `INSERT INTO order_items (
         order_id, product_id, title_snapshot, quantity, unit_price_minor
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, product.id, product.title, input.quantity, product.buy_now_price_minor],
    );
    await client.query(
      `UPDATE products
       SET quantity = quantity - $2,
         status = CASE WHEN quantity - $2 = 0 THEN 'SOLD' ELSE status END,
         updated_at = now()
       WHERE id = $1`,
      [product.id, input.quantity],
    );
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('order', $1, 'order.created', $2)`,
      [row.id, JSON.stringify({ event: "order.created", orderId: row.id })],
    );
    return row;
  });

  return json({ order }, { status: 201 });
});
