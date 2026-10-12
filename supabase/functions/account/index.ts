// Account actions that need the server's own key.
// POST { action: "save_key", key, base_url?, model? }   check a key for any OpenAI-compatible API, then store it
//      encrypted in Vault (base_url defaults to OpenAI; model is required for other providers)
// POST { action: "delete_account", confirm: "delete" }   remove every file, then the account (cascades all data)
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { studentClient } from "../_lib/auth.ts";
import { corsHeaders, json } from "../_lib/cors.ts";
import { checkProvider, LLM_MODEL, safeBaseUrl } from "../_lib/llm.ts";

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
    if (key.length < 16 || key.length > 400 || /\s/.test(key)) return json(req, { error: "format" }, 400);
    const baseUrl = safeBaseUrl(typeof body.base_url === "string" && body.base_url.trim() ? body.base_url : "https://api.openai.com/v1");
    if (!baseUrl) return json(req, { error: "bad_url" }, 400);
    const openai = baseUrl.startsWith("https://api.openai.com/");
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim().slice(0, 120) : openai ? LLM_MODEL : "";
    if (!model) return json(req, { error: "model_required" }, 400);
    const check = await checkProvider({ apiKey: key, baseUrl, model });
    if (check.result !== "ok") return json(req, { error: check.result, suggestions: check.suggestions }, check.result === "unreachable" ? 503 : 400);
    const { error } = await admin.rpc("store_byok", { p_user: student.userId, p_key: key, p_base_url: baseUrl, p_model: model });
    if (error) return json(req, { error: "save_failed" }, 500);
    return json(req, { last4: key.slice(-4), base_url: baseUrl, model });
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
