import type { QueryResultRow } from "pg";
import { assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { showSchema } from "@/lib/schemas";

type ShowRow = QueryResultRow & {
  id: string;
  sellerId: string;
  seller: string;
  title: string;
  description: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
};

export const GET = withApiErrors(async () => {
  const result = await query<ShowRow>(
    `SELECT sh.id, sh.seller_id AS "sellerId", s.display_name AS seller,
       sh.title, sh.description, sh.scheduled_at AS "scheduledAt",
       sh.started_at AS "startedAt", sh.ended_at AS "endedAt", sh.status
     FROM shows sh
     JOIN seller_profiles s ON s.id = sh.seller_id
     WHERE sh.status IN ('SCHEDULED', 'LIVE')
     ORDER BY CASE WHEN sh.status = 'LIVE' THEN 0 ELSE 1 END, sh.scheduled_at
     LIMIT 100`,
  );
  return json({ shows: result.rows });
});

export const POST = withApiErrors(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser(["SELLER", "ADMIN"]);
  const input = await parseJson(request, showSchema);
  const result = await query<ShowRow>(
    `INSERT INTO shows (seller_id, title, description, scheduled_at)
     SELECT id, $2, $3, $4
     FROM seller_profiles
     WHERE user_id = $1 AND verification_status = 'VERIFIED'
     RETURNING id, seller_id AS "sellerId", title, description,
       scheduled_at AS "scheduledAt", started_at AS "startedAt",
       ended_at AS "endedAt", status`,
    [user.id, input.title, input.description, input.scheduledAt],
  );
  return json({ show: result.rows[0] }, { status: 201 });
});
