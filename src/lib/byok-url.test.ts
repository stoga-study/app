import { describe, expect, it } from "vitest";
import { safeBaseUrl } from "../../supabase/functions/_lib/url";

describe("safeBaseUrl (Independent plan API addresses)", () => {
  it("accepts public https APIs and tidies them", () => {
    expect(safeBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(safeBaseUrl(" https://openrouter.ai/api/v1/ ")).toBe("https://openrouter.ai/api/v1");
    expect(safeBaseUrl("https://api.groq.com/openai/v1/chat/completions")).toBe("https://api.groq.com/openai/v1");
    expect(safeBaseUrl("https://api.deepinfra.com/v1/openai?x=1#y")).toBe("https://api.deepinfra.com/v1/openai");
  });
  it("refuses anything that could reach private networks or isn't https", () => {
    for (const bad of [
      "http://api.openai.com/v1", "https://localhost/v1", "https://127.0.0.1/v1", "https://10.0.0.5/v1", "https://[::1]/v1",
      "https://169.254.169.254/latest", "https://printer.local/v1", "https://db.internal/v1", "https://intranet/v1",
      "https://user:pass@api.example.com/v1", "https://api.example.com:8443/v1", "https://abc.supabase.co/functions/v1",
      "ftp://api.example.com", "not a url", "",
    ]) expect(safeBaseUrl(bad), bad).toBeNull();
  });
});
