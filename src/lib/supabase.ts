import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.");
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    // The session is saved on this device and refreshed in the background, so students stay
    // signed in until they choose to sign out.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Implicit flow: a magic link signs in whichever device opens it. (PKCE would only work in
    // the browser that asked, which breaks "request on laptop, tap the email on your phone".)
    flowType: "implicit",
  },
});
