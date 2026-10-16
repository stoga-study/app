import { describe, expect, it } from "vitest";
import { backoff, isChunkError, isTransient, queryRetry, withRetry } from "./retry";

describe("retrying", () => {
  it("retries passing failures only", () => {
    expect(isTransient(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransient({ message: "Load failed" })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ context: { status: 502 } })).toBe(true);
    expect(isTransient({ status: 403 })).toBe(false);
    expect(isTransient({ status: 404 })).toBe(false);
    expect(isTransient({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isTransient(null)).toBe(false);
  });

  it("backs off, with a cap", () => {
    expect(backoff(1, () => 0.5)).toBe(800);
    expect(backoff(3, () => 0.5)).toBe(3200);
    expect(backoff(10, () => 0.5)).toBe(8000);
  });

  it("tries again until it works, or gives up", async () => {
    let n = 0;
    const flaky = async () => {
      if (++n < 3) throw new TypeError("Failed to fetch");
      return "ok";
    };
    expect(await withRetry(flaky, 3, async () => {})).toBe("ok");
    expect(n).toBe(3);
    let m = 0;
    await expect(withRetry(async () => { m++; throw { status: 400 }; }, 3, async () => {})).rejects.toEqual({ status: 400 });
    expect(m).toBe(1);
    await expect(withRetry(async () => { throw new TypeError("Failed to fetch"); }, 2, async () => {})).rejects.toThrow("Failed to fetch");
  });

  it("tells React Query when to retry, and spots missing code files", () => {
    expect(queryRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(queryRetry(3, new TypeError("Failed to fetch"))).toBe(false);
    expect(queryRetry(0, { status: 401 })).toBe(false);
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isChunkError(new Error("x is undefined"))).toBe(false);
  });
});
