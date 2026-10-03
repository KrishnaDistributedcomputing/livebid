import type { QueryResultRow } from "pg";
import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/schemas";

type LoginRow = QueryResultRow & {
  id: string;
  email: string;
  username: string;
  role: "BUYER" | "SELLER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  password_hash: string;
};

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  const input = await parseJson(request, loginSchema);
  await enforceRateLimit(`login:${input.email}`, 10, 15 * 60);

  const result = await query<LoginRow>(
    `SELECT id, email, username, role, status, password_hash
     FROM users
     WHERE lower(email) = lower($1)`,
    [input.email],
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
  }

  await createSession(user.id);
  return json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
    },
  });
});
