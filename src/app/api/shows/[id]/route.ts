import type { QueryResultRow } from "pg";
import { ApiError, assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { showStatusSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };
type ShowRow = QueryResultRow & {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
};

export const GET = withApiErrors(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const result = await query<ShowRow>(
    `SELECT id, title, status, scheduled_at AS "scheduledAt",
       started_at AS "startedAt", ended_at AS "endedAt"
     FROM shows WHERE id = $1`,
    [id],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "SHOW_NOT_FOUND", "The show was not found.");
  }
  return json({ show: result.rows[0] });
});

export const PATCH = withApiErrors(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const user = await requireUser(["SELLER", "ADMIN"]);
  const { id } = await context.params;
  const input = await parseJson(request, showStatusSchema);
  const result = await query<ShowRow>(
    `UPDATE shows sh
     SET status = $3,
       started_at = CASE WHEN $3 = 'LIVE' THEN coalesce(started_at, now()) ELSE started_at END,
       ended_at = CASE WHEN $3 IN ('ENDED', 'CANCELED') THEN now() ELSE ended_at END,
       updated_at = now()
     FROM seller_profiles s
     WHERE sh.id = $1
       AND sh.seller_id = s.id
       AND (s.user_id = $2 OR $4 = 'ADMIN')
       AND (
         (sh.status = 'SCHEDULED' AND $3 IN ('LIVE', 'CANCELED'))
         OR (sh.status = 'LIVE' AND $3 IN ('ENDED', 'CANCELED'))
       )
     RETURNING sh.id, sh.title, sh.status, sh.scheduled_at AS "scheduledAt",
       sh.started_at AS "startedAt", sh.ended_at AS "endedAt"`,
    [id, user.id, input.status, user.role],
  );
  if (!result.rows[0]) {
    throw new ApiError(
      409,
      "SHOW_TRANSITION_REJECTED",
      "The show was not found or cannot move to the requested status.",
    );
  }
  return json({ show: result.rows[0] });
});
