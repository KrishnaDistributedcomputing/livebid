import type { QueryResultRow } from "pg";
import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { auctionSchema } from "@/lib/schemas";

type AuctionRow = QueryResultRow & {
  id: string;
  showId: string;
  productId: string;
  currency: string;
  currentPriceMinor: number;
  bidIncrementMinor: number;
  startsAt: string;
  endsAt: string;
  status: string;
  sequence: number;
  version: number;
};

export const GET = withApiErrors(async (request: Request) => {
  const showId = new URL(request.url).searchParams.get("showId");
  const result = await query<AuctionRow>(
    `SELECT id, show_id AS "showId", product_id AS "productId", currency,
       current_price_minor AS "currentPriceMinor",
       bid_increment_minor AS "bidIncrementMinor", starts_at AS "startsAt",
       ends_at AS "endsAt", status, sequence, version
     FROM auctions
     WHERE ($1::uuid IS NULL OR show_id = $1)
       AND status IN ('SCHEDULED', 'ACTIVE')
     ORDER BY starts_at
     LIMIT 100`,
    [showId],
  );
  return json({ auctions: result.rows });
});

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser(["SELLER", "ADMIN"]);
  const input = await parseJson(request, auctionSchema);
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new ApiError(400, "INVALID_DEADLINE", "endsAt must be after startsAt.");
  }

  const auction = await transaction(async (client) => {
    const ownership = await client.query<QueryResultRow & {
      seller_id: string;
      currency: string;
    }>(
      `SELECT p.seller_id, p.currency
       FROM products p
       JOIN shows sh ON sh.id = $2 AND sh.seller_id = p.seller_id
       JOIN seller_profiles s ON s.id = p.seller_id
       WHERE p.id = $1
         AND (s.user_id = $3 OR $4 = 'ADMIN')
         AND p.status = 'ACTIVE'
       FOR UPDATE OF p`,
      [input.productId, input.showId, user.id, user.role],
    );
    if (!ownership.rows[0]) {
      throw new ApiError(
        403,
        "AUCTION_OWNERSHIP_REQUIRED",
        "The product and show must belong to the authenticated seller.",
      );
    }

    const status = new Date(input.startsAt) <= new Date() ? "ACTIVE" : "SCHEDULED";
    const result = await client.query<AuctionRow>(
      `INSERT INTO auctions (
         show_id, product_id, seller_id, currency, start_price_minor,
         current_price_minor, bid_increment_minor, starts_at, ends_at,
         anti_snipe_seconds, auction_type, status
       )
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, show_id AS "showId", product_id AS "productId", currency,
         current_price_minor AS "currentPriceMinor",
         bid_increment_minor AS "bidIncrementMinor", starts_at AS "startsAt",
         ends_at AS "endsAt", status, sequence, version`,
      [
        input.showId,
        input.productId,
        ownership.rows[0].seller_id,
        ownership.rows[0].currency,
        input.startPriceMinor,
        input.bidIncrementMinor,
        input.startsAt,
        input.endsAt,
        input.antiSnipeSeconds,
        input.auctionType,
        status,
      ],
    );
    return result.rows[0];
  });

  return json({ auction }, { status: 201 });
});
