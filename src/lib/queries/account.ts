import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

export function useApiKey() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["api-key", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys").select("provider, last4, created_at, base_url, model").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Presets only fill in the address and a sensible model; any OpenAI-compatible API works through "Other". */
export const PROVIDER_PRESETS = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-6-luna" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-oss-120b" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  { name: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai", model: "openai/gpt-oss-120b" },
  { name: "Together", baseUrl: "https://api.together.xyz/v1", model: "openai/gpt-oss-120b" },
  { name: "Other (OpenAI-compatible)", baseUrl: "", model: "" },
] as const;

export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** A failed key check, with the form field it is about (so that field is highlighted, and the key kept unless it was the problem). */
export class KeyError extends Error {
  constructor(message: string, public field: "key" | "url" | "model" | null) {
    super(message);
  }
}

const KEY_FIELD: Record<string, KeyError["field"]> = { format: "key", invalid: "key", bad_url: "url", not_compatible: "url", model_required: "model", model_not_found: "model" };

function keyError(code: string | undefined, suggestions: string[] | undefined, host: string) {
  switch (code) {
    case "format": return "That does not look like a complete API key. Copy the whole key, with no spaces.";
    case "bad_url": return "That API address will not work. It needs to be a full public https address, like https://api.openai.com/v1.";
    case "model_required": return "Add the model name your provider uses, for example openai/gpt-oss-120b.";
    case "invalid": return `${host} said that key is not valid. Nothing was saved and your study material is untouched.`;
    case "model_not_found": return `${host} does not offer that model.${suggestions?.length ? ` Models it lists include: ${suggestions.join(", ")}.` : " Check the exact model name in your provider's docs."}`;
    case "not_compatible": return `${host} did not answer like an OpenAI-compatible API. Check the address (it usually ends in /v1).`;
    case "unreachable": return `We could not reach ${host} to check the key, or it is out of credit. Try again in a moment.`;
    default: return "We could not save the key. Try again in a moment.";
  }
}

export function useSaveKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; baseUrl: string; model: string }) => {
      const { data, error } = await supabase.functions.invoke<{ last4: string; base_url: string; model: string }>("account", {
        body: { action: "save_key", key: input.key, base_url: input.baseUrl, model: input.model },
      });
      if (error) {
        const j = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new KeyError(keyError(j?.error, j?.suggestions, hostOf(input.baseUrl || "https://api.openai.com/v1")), KEY_FIELD[j?.error] ?? null);
      }
      return data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-key"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
    },
  });
}

export function useRemoveKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("remove_api_key");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-key"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["allowance"] });
    },
  });
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke("account", { body: { action: "delete_account", confirm: "delete" } });
  if (error) throw error;
  // The account is gone on the server, so a normal sign-out would be refused. Clear this device's
  // saved session directly, then reload so nothing from the old account stays in memory.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
  } catch {
    /* storage blocked: the reload still drops the in-memory session */
  }
  window.location.replace("/welcome");
}

export function useUpdateName() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (firstName: string) => {
      const { error } = await supabase.from("profiles").update({ first_name: firstName.trim().slice(0, 60) || null }).eq("user_id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export async function sendFeedback(f: { kind: "bug" | "idea" | "testimonial"; body: string; page: string; consent: boolean }) {
  const { error } = await supabase.from("feedback").insert({ kind: f.kind, body: f.body.trim().slice(0, 4000), page: f.page.slice(0, 200), consent_to_publish: f.consent });
  if (error) throw error;
}
