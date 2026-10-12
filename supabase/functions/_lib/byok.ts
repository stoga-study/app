// The Independent plan: a student's own OpenAI-compatible API, read with the service role.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import type { OwnProvider } from "./llm.ts";

export async function ownProvider(admin: SupabaseClient, userId: string): Promise<OwnProvider | undefined> {
  const { data, error } = await admin.rpc("read_byok", { p_user: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.api_key ? { apiKey: row.api_key, baseUrl: row.base_url, model: row.model } : undefined;
}
