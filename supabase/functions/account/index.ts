// Account actions that need the server's own key.
// POST { action: "save_key", key }   check an OpenAI key with OpenAI, then store it encrypted in Vault
// POST { action: "delete_account", confirm: "delete" }   remove every file, then the account (cascades all data)
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { checkKey } from "../_lib/llm.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function removeAllFiles(userId: string) {
  const { data: folders } = await admin.storage.from("sources").list(userId, { limit: 1000 });
  for (const f of folders ?? []) {
    const { data: files } = await admin.storage.from("sources").list(`${userId}/${f.name}`, { limit: 1000 });
    if (files?.length) await admin.storage.from("sources").remove(files.map((x) => `${userId}/${f.name}/${x.name}`));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  const student = await studentClient(req);
  if (!student) return json(req, { error: "not_signed_in" }, 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "save_key") {
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) return json(req, { error: "format" }, 400);
    const check = await checkKey(key);
    if (check !== "ok") return json(req, { error: check }, check === "invalid" ? 400 : 503);
    const { error } = await admin.rpc("store_api_key", { p_user: student.userId, p_provider: "openai", p_key: key });
    if (error) return json(req, { error: "save_failed" }, 500);
    return json(req, { last4: key.slice(-4) });
  }

  if (body.action === "delete_account") {
    if (body.confirm !== "delete") return json(req, { error: "confirm" }, 400);
    await removeAllFiles(student.userId);
    // Vault secrets are not covered by the cascade, so remove the key first.
    await student.db.rpc("remove_api_key");
    const { error } = await admin.auth.admin.deleteUser(student.userId);
    if (error) return json(req, { error: "delete_failed" }, 500);
    return json(req, { deleted: true });
  }

  return json(req, { error: "unknown_action" }, 400);
});
