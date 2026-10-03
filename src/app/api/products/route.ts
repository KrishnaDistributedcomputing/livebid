import type { QueryResultRow } from "pg";
import { json, parseJson, assertSameOrigin, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { productSchema } from "@/lib/schemas";

type ProductRow = QueryResultRow & {
  id: string;
  sellerId: string;
  seller: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  currency: string;
  buyNowPriceMinor: number | null;
  auctionStartPriceMinor: number | null;
  quantity: number;
  availableQuantity: number;
  imageUrl: string | null;
  status: string;
  createdAt: string;
};

export const GET = withApiErrors(async (request: Request) => {
  const url = new URL(request.url);
  const queryText = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const result = await query<ProductRow>(
    `SELECT p.id, p.seller_id AS "sellerId", s.display_name AS seller,
       p.title, p.description, p.category, p.condition, p.currency,
       p.buy_now_price_minor AS "buyNowPriceMinor",
       p.auction_start_price_minor AS "auctionStartPriceMinor",
       p.quantity, p.quantity - p.reserved_quantity AS "availableQuantity",
       p.image_url AS "imageUrl", p.status, p.created_at AS "createdAt"
     FROM products p
     JOIN seller_profiles s ON s.id = p.seller_id
     WHERE p.status = 'ACTIVE'
       AND ($1 = '' OR p.title ILIKE '%' || $1 || '%' OR s.display_name ILIKE '%' || $1 || '%')
       AND ($2 = '' OR p.category = $2)
     ORDER BY p.created_at DESC
     LIMIT 100`,
    [queryText, category],
  );
  return json({ products: result.rows });
});

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser(["SELLER", "ADMIN"]);
  const input = await parseJson(request, productSchema);
  const result = await query<ProductRow>(
    `INSERT INTO products (
       seller_id, title, description, category, condition, currency,
       buy_now_price_minor, auction_start_price_minor, quantity, image_url
     )
     SELECT s.id, $2, $3, $4, $5, $6, $7, $8, $9, $10
     FROM seller_profiles s
     WHERE s.user_id = $1 AND s.verification_status = 'VERIFIED'
     RETURNING id, seller_id AS "sellerId", title, description, category,
       condition, currency, buy_now_price_minor AS "buyNowPriceMinor",
       auction_start_price_minor AS "auctionStartPriceMinor", quantity,
       quantity - reserved_quantity AS "availableQuantity", image_url AS "imageUrl",
       status, created_at AS "createdAt"`,
    [
      user.id,
      input.title,
      input.description,
      input.category,
      input.condition,
      input.currency,
      input.buyNowPriceMinor,
      input.auctionStartPriceMinor,
      input.quantity,
      input.imageUrl,
    ],
  );
  return json({ product: result.rows[0] }, { status: 201 });
});
