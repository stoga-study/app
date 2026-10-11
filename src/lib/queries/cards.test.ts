import { describe, expect, it } from "vitest";
import { joinNames, reviewMinutes } from "./cards";

describe("Home copy", () => {
  it("estimates review time without saying zero", () => {
    expect(reviewMinutes(1)).toBe("About 1 minute");
    expect(reviewMinutes(24)).toBe("About 10 minutes");
  });
  it("joins subject names", () => {
    expect(joinNames(["AP Statistics"])).toBe("AP Statistics");
    expect(joinNames(["AP Statistics", "Chemistry 1"])).toBe("AP Statistics and Chemistry 1");
    expect(joinNames(["A", "B", "C", "D"])).toBe("A, B and 2 more");
  });
});
