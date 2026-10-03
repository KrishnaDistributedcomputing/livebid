import { assertSameOrigin, json, withApiErrors } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  await destroySession();
  return json({ success: true });
});
