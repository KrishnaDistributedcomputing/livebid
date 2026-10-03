import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { submitBid } from "@/lib/auctions";
import { requireUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bidSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };

export const POST = withApiErrors(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(["BUYER", "ADMIN"]);
  const { id } = await context.params;
  const input = await parseJson(request, bidSchema);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required.",
    );
  }
  await enforceRateLimit(`bid:${user.id}:${id}`, 30, 60);
  const result = await submitBid({
    auctionId: id,
    buyerId: user.id,
    idempotencyKey,
    amountMinor: input.amountMinor ?? input.maxBidMinor!,
    currency: input.currency,
  });
  return json(result, { status: 201 });
});
