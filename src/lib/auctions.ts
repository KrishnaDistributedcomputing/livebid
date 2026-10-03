import type { PoolClient, QueryResultRow } from "pg";
import { ApiError } from "@/lib/api";
import { transaction } from "@/lib/db";

type AuctionRow = QueryResultRow & {
  id: string;
  seller_user_id: string;
  currency: string;
  current_price_minor: number;
  bid_increment_minor: number;
  highest_bidder_id: string | null;
  ends_at: Date;
  anti_snipe_seconds: number;
  auction_type: "STANDARD" | "SUDDEN_DEATH";
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED";
  sequence: number;
  version: number;
  remaining_ms: number;
};

type MaximumRow = QueryResultRow & {
  buyer_id: string;
  max_bid_minor: number;
  created_at: Date;
};

export type BidResult = {
  accepted: true;
  idempotent: boolean;
  auctionId: string;
  currentPriceMinor: number;
  currency: string;
  leadingBidderId: string;
  buyerIsLeading: boolean;
  endsAt: string;
  sequence: number;
  version: number;
};

async function loadAuctionForUpdate(client: PoolClient, auctionId: string) {
  const result = await client.query<AuctionRow>(
    `SELECT a.*, seller.user_id AS seller_user_id,
       greatest(0, extract(epoch FROM (a.ends_at - clock_timestamp())) * 1000)::integer
         AS remaining_ms
     FROM auctions a
     JOIN seller_profiles seller ON seller.id = a.seller_id
     WHERE a.id = $1
     FOR UPDATE OF a`,
    [auctionId],
  );
  return result.rows[0];
}

export async function submitBid(input: {
  auctionId: string;
  buyerId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
}): Promise<BidResult> {
  return transaction(async (client) => {
    const auction = await loadAuctionForUpdate(client, input.auctionId);
    if (!auction) {
      throw new ApiError(404, "AUCTION_NOT_FOUND", "The auction was not found.");
    }

    const existing = await client.query<QueryResultRow & { response_json: BidResult }>(
      `SELECT response_json
       FROM bids
       WHERE auction_id = $1 AND buyer_id = $2 AND idempotency_key = $3`,
      [input.auctionId, input.buyerId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      return { ...existing.rows[0].response_json, idempotent: true };
    }

    if (auction.seller_user_id === input.buyerId) {
      throw new ApiError(403, "SELF_BIDDING_FORBIDDEN", "Sellers cannot bid on their own items.");
    }
    if (auction.status !== "ACTIVE" || auction.remaining_ms <= 0) {
      throw new ApiError(409, "AUCTION_EXPIRED", "The auction is not accepting bids.");
    }
    if (auction.currency !== input.currency) {
      throw new ApiError(400, "CURRENCY_MISMATCH", "The bid currency does not match the auction.");
    }

    const minimum = auction.current_price_minor + auction.bid_increment_minor;
    if (input.amountMinor < minimum) {
      throw new ApiError(
        409,
        "BID_TOO_LOW",
        `The bid must be at least ${minimum} minor units.`,
      );
    }

    const maximums = await client.query<MaximumRow>(
      `SELECT DISTINCT ON (buyer_id) buyer_id, max_bid_minor, created_at
       FROM bids
       WHERE auction_id = $1
       ORDER BY buyer_id, max_bid_minor DESC, created_at ASC`,
      [input.auctionId],
    );

    const candidates = maximums.rows.filter((item) => item.buyer_id !== input.buyerId);
    candidates.push({
      buyer_id: input.buyerId,
      max_bid_minor: input.amountMinor,
      created_at: new Date(),
    });
    candidates.sort(
      (left, right) =>
        right.max_bid_minor - left.max_bid_minor ||
        left.created_at.getTime() - right.created_at.getTime(),
    );

    const leader = candidates[0];
    const runnerUp = candidates[1];
    const calculatedPrice = runnerUp
      ? Math.min(leader.max_bid_minor, runnerUp.max_bid_minor + auction.bid_increment_minor)
      : Math.min(leader.max_bid_minor, minimum);
    const currentPriceMinor = Math.max(auction.current_price_minor, calculatedPrice);
    const sequence = auction.sequence + 1;
    const version = auction.version + 1;
    const extendsAuction =
      auction.auction_type === "STANDARD" &&
      auction.remaining_ms <= auction.anti_snipe_seconds * 1000;
    const endsAt = extendsAuction
      ? new Date(Date.now() + auction.anti_snipe_seconds * 1000)
      : auction.ends_at;

    const response: BidResult = {
      accepted: true,
      idempotent: false,
      auctionId: auction.id,
      currentPriceMinor,
      currency: auction.currency,
      leadingBidderId: leader.buyer_id,
      buyerIsLeading: leader.buyer_id === input.buyerId,
      endsAt: endsAt.toISOString(),
      sequence,
      version,
    };

    await client.query(
      `UPDATE auctions
       SET current_price_minor = $2, highest_bidder_id = $3, ends_at = $4,
         sequence = $5, version = $6, updated_at = now()
       WHERE id = $1`,
      [auction.id, currentPriceMinor, leader.buyer_id, endsAt, sequence, version],
    );
    await client.query(
      `INSERT INTO bids (
         auction_id, buyer_id, amount_minor, max_bid_minor, sequence,
         idempotency_key, response_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auction.id,
        input.buyerId,
        currentPriceMinor,
        input.amountMinor,
        sequence,
        input.idempotencyKey,
        JSON.stringify(response),
      ],
    );
    await client.query(
      `INSERT INTO outbox_events (
         aggregate_type, aggregate_id, event_type, payload, sequence
       )
       VALUES ('auction', $1, 'auction.bid', $2, $3)`,
      [
        auction.id,
        JSON.stringify({
          event: "auction.bid",
          auctionId: auction.id,
          currentPriceMinor,
          currency: auction.currency,
          leadingBidderId: leader.buyer_id,
          endsAt: endsAt.toISOString(),
          sequence,
          version,
        }),
        sequence,
      ],
    );

    return response;
  });
}
