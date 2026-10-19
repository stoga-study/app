import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/session";
import { supabase } from "../supabase";

export type LedgerItem = { kind: "cost" | "funding"; label: string; amount: number };
export type LedgerMonth = { month: string; aiCost: number; otherCosts: number; funding: number; students: number; items: LedgerItem[] };

/** Months from the first one with anything in it to now, newest first (empty months before launch are left out). */
export function trimLedger(rows: LedgerMonth[]): LedgerMonth[] {
  const used = (m: LedgerMonth) => m.aiCost > 0 || m.otherCosts > 0 || m.funding > 0 || m.students > 0;
  const lastUsed = rows.map(used).lastIndexOf(true);
  return lastUsed < 0 ? rows.slice(0, 1) : rows.slice(0, lastUsed + 1);
}

/** What Stoga.study costs to run each month and how it's paid for (Plans). */
export function useLedger() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["ledger"],
    enabled: !!session,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<LedgerMonth[]> => {
      const { data, error } = await supabase.rpc("funding_ledger", { p_months: 12 });
      if (error) throw error;
      return trimLedger((data ?? []).map((r) => ({
        month: r.month, aiCost: Number(r.ai_cost), otherCosts: Number(r.other_costs), funding: Number(r.funding), students: r.students,
        items: (Array.isArray(r.items) ? r.items : []) as LedgerItem[],
      })));
    },
  });
}

/** The donation link, once payments are set up (VITE_DONATE_URL). Until then, donating is switched off. */
export const DONATE_URL = (import.meta.env.VITE_DONATE_URL as string | undefined)?.trim() || null;
