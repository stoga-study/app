import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

/**
 * A Supabase client acting as the signed-in student, so row-level security applies to every
 * query the function makes. Returns null when the request has no valid session.
 */
export async function studentClient(req: Request): Promise<{ db: SupabaseClient; userId: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return { db, userId: data.user.id };
}
