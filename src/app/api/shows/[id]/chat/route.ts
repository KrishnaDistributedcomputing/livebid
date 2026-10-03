import type { QueryResultRow } from "pg";
import { assertSameOrigin, json, parseJson, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chatMessageSchema } from "@/lib/schemas";

type Context = { params: Promise<{ id: string }> };
type MessageRow = QueryResultRow & {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
};

export const GET = withApiErrors(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const result = await query<MessageRow>(
    `SELECT m.id, m.user_id AS "userId", u.username, m.body,
       m.created_at AS "createdAt"
     FROM chat_messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.show_id = $1
     ORDER BY m.created_at DESC
     LIMIT 100`,
    [id],
  );
  return json({ messages: result.rows.reverse() });
});

export const POST = withApiErrors(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await context.params;
  const input = await parseJson(request, chatMessageSchema);
  await enforceRateLimit(`chat:${user.id}:${id}`, 20, 60);

  const message = await transaction(async (client) => {
    const result = await client.query<MessageRow>(
      `INSERT INTO chat_messages (show_id, user_id, body)
       SELECT sh.id, $2, $3
       FROM shows sh
       WHERE sh.id = $1 AND sh.status = 'LIVE'
       RETURNING id, user_id AS "userId", $4::text AS username, body,
         created_at AS "createdAt"`,
      [id, user.id, input.body, user.username],
    );
    const row = result.rows[0];
    if (!row) return null;
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('show', $1, 'chat.message', $2)`,
      [id, JSON.stringify({ event: "chat.message", showId: id, message: row })],
    );
    return row;
  });
  if (!message) {
    return json(
      { error: { code: "SHOW_NOT_LIVE", message: "Chat is available only for live shows." } },
      { status: 409 },
    );
  }
  return json({ message }, { status: 201 });
});
