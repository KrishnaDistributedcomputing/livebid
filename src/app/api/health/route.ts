export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    service: "livebid-web",
    timestamp: new Date().toISOString(),
  });
}