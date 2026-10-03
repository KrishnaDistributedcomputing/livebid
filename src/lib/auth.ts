import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import type { QueryResultRow } from "pg";
import { ApiError } from "@/lib/api";
import { query, transaction } from "@/lib/db";
import { getEnv } from "@/lib/env";

export type UserRole = "BUYER" | "SELLER" | "ADMIN";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED";
};

type SessionRow = QueryResultRow & SessionUser;

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSession(userId: string) {
  const env = getEnv();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, digestToken(token), expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroySession() {
  const env = getEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [digestToken(token)]);
  }
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const env = getEnv();
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const result = await query<SessionRow>(
    `UPDATE sessions s
     SET last_seen_at = now()
     FROM users u
     WHERE s.token_hash = $1
       AND s.user_id = u.id
       AND s.expires_at > now()
     RETURNING u.id, u.email, u.username, u.role, u.status`,
    [digestToken(token)],
  );

  return result.rows[0] ?? null;
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
  }
  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission for this action.");
  }
  return user;
}

export async function registerUser(input: {
  email: string;
  username: string;
  password: string;
  role: "BUYER" | "SELLER";
}) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await transaction(async (client) => {
      const userResult = await client.query<SessionRow>(
        `INSERT INTO users (email, username, password_hash, role)
         VALUES (lower($1), $2, $3, $4)
         RETURNING id, email, username, role, status`,
        [input.email, input.username, passwordHash, input.role],
      );
      const user = userResult.rows[0];
      if (input.role === "SELLER") {
        await client.query(
          `INSERT INTO seller_profiles (user_id, display_name)
           VALUES ($1, $2)`,
          [user.id, input.username],
        );
      }
      return user;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new ApiError(409, "ACCOUNT_EXISTS", "The email or username is already in use.");
    }
    throw error;
  }
}
