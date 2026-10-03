import { assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { createSession, registerUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/schemas";

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(
    `register:${request.headers.get("x-forwarded-for") ?? "local"}`,
    10,
    60 * 60,
  );
  const input = await parseJson(request, registerSchema);
  const user = await registerUser(input);
  await createSession(user.id);
  return json({ user }, { status: 201 });
});
