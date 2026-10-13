import { supabase } from "../supabase";
import type { OrgCard } from "./organise";

/** Why a similar card could not be made: today's limit, the student's own key, or a busy service. */
export class SimilarError extends Error {
  constructor(public code: "limit" | "key_invalid" | "busy" | "unavailable" | "offline") {
    super(code);
    this.name = "SimilarError";
  }
}

/** "Give me one like this": a fresh card testing the same idea, with different numbers or wording. */
export async function similarCard(cardId: string): Promise<OrgCard> {
  if (!navigator.onLine) throw new SimilarError("offline");
  const { data, error } = await supabase.functions.invoke<{ card: OrgCard }>("similar-card", { body: { card_id: cardId } });
  if (error || !data?.card) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    const code = j?.error;
    throw new SimilarError(code === "limit" || code === "key_invalid" || code === "busy" ? code : "unavailable");
  }
  return data.card;
}
