import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

export function useApiKey() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["api-key", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys").select("provider, last4, created_at").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const KEY_ERRORS: Record<string, string> = {
  format: "That does not look like a Groq key. Groq keys start with gsk_.",
  invalid: "Groq said that key is not valid. Nothing was saved and your study material is untouched.",
  unreachable: "We could not reach Groq to check the key. Try again in a moment.",
};

export function useSaveKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await supabase.functions.invoke<{ last4: string }>("account", { body: { action: "save_key", key } });
      if (error) {
        const j = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(KEY_ERRORS[j?.error] ?? "We could not save the key. Try again in a moment.");
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
  // The account no longer exists on the server, so only clear this device's session.
  await supabase.auth.signOut({ scope: "local" });
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
