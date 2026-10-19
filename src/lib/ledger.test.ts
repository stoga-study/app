import { describe, expect, it } from "vitest";
import { trimLedger, type LedgerMonth } from "./queries/ledger";

const m = (month: string, aiCost = 0, students = 0): LedgerMonth => ({ month, aiCost, otherCosts: 0, funding: 0, students, items: [] });

describe("funding ledger", () => {
  it("leaves out the empty months before launch, keeps quiet months after it", () => {
    expect(trimLedger([m("2026-12-01"), m("2026-11-01", 1.2, 9), m("2026-10-01", 0.72, 6), m("2026-09-01"), m("2026-08-01")]).map((x) => x.month)).toEqual(["2026-12-01", "2026-11-01", "2026-10-01"]);
  });
  it("always shows at least this month", () => {
    expect(trimLedger([m("2026-10-01"), m("2026-09-01")]).map((x) => x.month)).toEqual(["2026-10-01"]);
  });
});
