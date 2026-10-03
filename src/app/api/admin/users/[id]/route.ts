import type { QueryResultRow } from "pg";
import { z } from "zod";
import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(5).max(500),
});

type UpdatedUser = QueryResultRow & {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  updatedAt: string;
};

export const PATCH = withApiErrors(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const actor = await requireUser(["ADMIN"]);
  const { id } = await context.params;
  const input = await parseJson(request, statusSchema);
  if (actor.id === id && input.status === "SUSPENDED") {
    throw new ApiError(409, "SELF_SUSPENSION_FORBIDDEN", "Administrators cannot suspend themselves.");
  }

  const user = await transaction(async (client) => {
    const current = await client.query<QueryResultRow & { status: string }>(
      "SELECT status FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!current.rows[0]) {
      throw new ApiError(404, "USER_NOT_FOUND", "The user was not found.");
    }
    if (current.rows[0].status === input.status) {
      throw new ApiError(409, "STATUS_UNCHANGED", "The account already has this status.");
    }

    const updated = await client.query<UpdatedUser>(
      `UPDATE users
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, email, username, role, status, updated_at AS "updatedAt"`,
      [id, input.status],
    );
    await client.query(
      `UPDATE seller_profiles
       SET verification_status = CASE
         WHEN $2 = 'SUSPENDED' THEN 'SUSPENDED'
         WHEN verification_status = 'SUSPENDED' THEN 'VERIFIED'
         ELSE verification_status
       END,
       updated_at = now()
       WHERE user_id = $1`,
      [id, input.status],
    );
    if (input.status === "SUSPENDED") {
      await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    }
    await client.query(
      `INSERT INTO audit_events (
         actor_user_id, action, target_type, target_id, reason, metadata
       )
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [
        actor.id,
        input.status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_ACTIVATED",
        id,
        input.reason,
        JSON.stringify({
          previousStatus: current.rows[0].status,
          newStatus: input.status,
        }),
      ],
    );
    return updated.rows[0];
  });

  return json({ user });
});
