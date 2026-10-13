import type { Grade } from "../../../supabase/functions/_lib/grade";
import { supabase } from "../supabase";

/** Why the AI could not check an answer: today's limit, the student's own key, or a busy service. */
export class GradeError extends Error {
  constructor(public code: "grade_limit" | "key_invalid" | "busy" | "unavailable" | "offline") {
    super(code);
    this.name = "GradeError";
  }
}

/** Ask the AI to check a typed answer to one of your cards. */
export async function gradeAnswer(cardId: string, answer: string): Promise<Grade> {
  if (!navigator.onLine) throw new GradeError("offline");
  const { data, error } = await supabase.functions.invoke<Grade>("grade-answer", { body: { card_id: cardId, answer } });
  if (error || !data) {
    const j = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    const code = j?.error;
    throw new GradeError(code === "grade_limit" || code === "key_invalid" || code === "busy" ? code : "unavailable");
  }
  return data;
}
