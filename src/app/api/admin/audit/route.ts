import type { QueryResultRow } from "pg";
import { json, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

type AuditRow = QueryResultRow & {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const GET = withApiErrors(async () => {
  await requireUser(["ADMIN"]);
  const result = await query<AuditRow>(
    `SELECT a.id, u.username AS actor, a.action,
       a.target_type AS "targetType", a.target_id AS "targetId",
       a.reason, a.metadata, a.created_at AS "createdAt"
     FROM audit_events a
     JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC
     LIMIT 200`,
  );
  return json({ events: result.rows });
});
