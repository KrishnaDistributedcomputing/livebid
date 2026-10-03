import { json, withApiErrors } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export const GET = withApiErrors(async () => {
  const user = await getSessionUser();
  return json({ user });
});
