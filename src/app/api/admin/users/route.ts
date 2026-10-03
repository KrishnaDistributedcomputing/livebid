import type { QueryResultRow } from "pg";
import { ApiError, json, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

type AdminUserRow = QueryResultRow & {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  sellerName: string | null;
  verificationStatus: string | null;
  productCount: number;
  orderCount: number;
  createdAt: string;
  lastSeenAt: string | null;
};

const allowedRoles = new Set(["", "BUYER", "SELLER", "ADMIN"]);
const allowedStatuses = new Set(["", "ACTIVE", "SUSPENDED"]);

export const GET = withApiErrors(async (request: Request) => {
  await requireUser(["ADMIN"]);
  const params = new URL(request.url).searchParams;
  const search = params.get("q")?.trim() ?? "";
  const role = params.get("role")?.toUpperCase() ?? "";
  const status = params.get("status")?.toUpperCase() ?? "";
  if (!allowedRoles.has(role) || !allowedStatuses.has(status)) {
    throw new ApiError(400, "INVALID_FILTER", "The role or status filter is invalid.");
  }

  const result = await query<AdminUserRow>(
    `SELECT u.id, u.email, u.username, u.role, u.status,
       s.display_name AS "sellerName",
       s.verification_status AS "verificationStatus",
       count(DISTINCT p.id)::integer AS "productCount",
       count(DISTINCT o.id)::integer AS "orderCount",
       u.created_at AS "createdAt", max(se.last_seen_at) AS "lastSeenAt"
     FROM users u
     LEFT JOIN seller_profiles s ON s.user_id = u.id
     LEFT JOIN products p ON p.seller_id = s.id
     LEFT JOIN orders o ON o.buyer_id = u.id OR o.seller_id = s.id
     LEFT JOIN sessions se ON se.user_id = u.id AND se.expires_at > now()
     WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%'
       OR u.username ILIKE '%' || $1 || '%'
       OR s.display_name ILIKE '%' || $1 || '%')
       AND ($2 = '' OR u.role = $2)
       AND ($3 = '' OR u.status = $3)
     GROUP BY u.id, s.display_name, s.verification_status
     ORDER BY u.created_at DESC
     LIMIT 200`,
    [search, role, status],
  );
  return json({ users: result.rows });
});
