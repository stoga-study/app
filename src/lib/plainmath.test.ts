import { describe, expect, it } from "vitest";
import { plainMath } from "../../supabase/functions/_lib/study";

// Generated study text must read as correct math; a wrong conversion would teach the wrong formula.
describe("plainMath", () => {
  it.each([
    ["SE_{\\bar x} = \\frac{\\sigma}{\\sqrt{n}}", "SE_x̄ = σ/√n"],
    ["SE_{\\hat p} = \\sqrt{\\frac{p(1-p)}{n}}", "SE_p̂ = √((p(1-p))/n)"],
    ["\\(\\sqrt{p(1-p)/n}\\)", "√(p(1-p)/n)"],
    ["When both \\(np \\ge 10\\) and \\(n(1-p) \\ge 10\\)", "When both np ≥ 10 and n(1-p) ≥ 10"],
    ["x^2 + \\frac{1}{2}", "x² + 1/2"],
    ["\\frac{12}{\\sqrt{36}} = \\frac{12}{6} = 2", "12/√36 = 12/6 = 2"],
    ["the sample mean \\(\\bar{x}\\) estimates \\(\\mu\\)", "the sample mean x̄ estimates μ"],
    ["plain text stays", "plain text stays"],
  ])("%s", (input, expected) => expect(plainMath(input)).toBe(expected));
});
