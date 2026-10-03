import type { QueryResultRow } from "pg";
import { ApiError, json, withApiErrors } from "@/lib/api";
import { query } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };
type AuctionSnapshot = QueryResultRow & {
  id: string;
  showId: string;
  productId: string;
  product: string;
  seller: string;
  currency: string;
  startPriceMinor: number;
  currentPriceMinor: number;
  bidIncrementMinor: number;
  leader: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  sequence: number;
  version: number;
};

export const GET = withApiErrors(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const result = await query<AuctionSnapshot>(
    `SELECT a.id, a.show_id AS "showId", a.product_id AS "productId",
       p.title AS product, s.display_name AS seller, a.currency,
       a.start_price_minor AS "startPriceMinor",
       a.current_price_minor AS "currentPriceMinor",
       a.bid_increment_minor AS "bidIncrementMinor", u.username AS leader,
       a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status,
       a.sequence, a.version
     FROM auctions a
     JOIN products p ON p.id = a.product_id
     JOIN seller_profiles s ON s.id = a.seller_id
     LEFT JOIN users u ON u.id = a.highest_bidder_id
     WHERE a.id = $1`,
    [id],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "AUCTION_NOT_FOUND", "The auction was not found.");
  }
  return json({ auction: result.rows[0] });
});
