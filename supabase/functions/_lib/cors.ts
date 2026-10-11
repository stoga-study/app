// The app calls functions from app.stoga.study (and localhost while developing).
const ALLOWED = [/^https:\/\/app\.stoga\.study$/, /^https:\/\/[a-z0-9-]+\.stoga-study-app\.pages\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.some((r) => r.test(origin)) ? origin : "https://app.stoga.study",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
