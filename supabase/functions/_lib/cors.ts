// The app calls functions from beta.stoga.study, its Cloudflare Worker address, and localhost while developing.
const ALLOWED = [/^https:\/\/(beta|app)\.stoga\.study$/, /^https:\/\/app\.abhishek1317\.workers\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.some((r) => r.test(origin)) ? origin : "https://beta.stoga.study",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
