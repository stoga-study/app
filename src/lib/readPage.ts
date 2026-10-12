import { ExtractError } from "./extract";
import { supabase } from "./supabase";

/**
 * Read the text on one page image (a scan or a photo) with the read-page function.
 * Busy moments are retried; the daily page limit and real failures become ExtractErrors.
 */
export async function readPageImage(dataUrl: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const { data: s } = await supabase.auth.getSession();
    let res: Response;
    try {
      res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-page`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
    } catch {
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw new ExtractError("scan_failed");
    }
    if (res.ok) return String((await res.json()).text ?? "");
    const j = await res.json().catch(() => ({}));
    if (j.error === "page_limit") throw new ExtractError("scan_limit");
    if ((res.status === 503 || res.status >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    throw new ExtractError("scan_failed");
  }
}
