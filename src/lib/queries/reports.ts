import { useQueryClient } from "@tanstack/react-query";
import type { Database } from "../database.types";
import { supabase } from "../supabase";

export type ReportItemType = Database["public"]["Enums"]["report_item"];

/** Flag a card, quiz question, notes section, guide section or tutor answer as wrong. Everything but a
 * tutor answer is hidden for the student at once; Aarav reviews reports in the admin dashboard. */
export async function reportContent(itemType: ReportItemType, itemId: string, subjectId: string | null, reason: string) {
  const { error } = await supabase.rpc("report_content", { p_item_type: itemType, p_item_id: itemId, p_reason: reason.slice(0, 500), p_subject_id: subjectId ?? undefined });
  if (error) throw error;
}

/** Keys to refresh after a report hides something, so it disappears from view right away. */
const KEYS_BY_TYPE: Record<ReportItemType, string[]> = {
  card: ["due-queue", "weak-cards", "class-cards", "deck", "studyset", "mastery-cards", "card-stats", "due-cards", "mistakes"],
  quiz_question: ["quiz", "mistakes", "unit-questions", "studyset"],
  notes_section: ["studyset"],
  guide_section: ["studyset"],
  tutor_message: [],
};

export function useReportContent() {
  const qc = useQueryClient();
  return async (itemType: ReportItemType, itemId: string, subjectId: string | null, reason: string) => {
    await reportContent(itemType, itemId, subjectId, reason);
    await Promise.all(KEYS_BY_TYPE[itemType].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };
}
