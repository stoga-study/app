// "What's new" breakdown email for a release, built from the same changelog the app shows.
//
// POST { version, test_to? }   with header x-admin-token: ADMIN_TOKEN (from the local admin dashboard).
//   test_to sends one preview to that address and records nothing. Otherwise it emails every student who
//   has email_updates on and has not had this release yet (logged in release_emails, so it never repeats).
// GET ?u=<user id>&t=<token>   the unsubscribe link in each email: turns email_updates off.
//
// Secrets: RESEND_API_KEY, ADMIN_TOKEN, UNSUBSCRIBE_SECRET; optional RELEASE_EMAIL_FROM and APP_URL.
// Deploy with --no-verify-jwt: the unsubscribe link has no sign-in, and POST checks ADMIN_TOKEN itself.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const APP_URL = (Deno.env.get("APP_URL") ?? "https://beta.stoga.study").replace(/\/$/, "");
const FROM = Deno.env.get("RELEASE_EMAIL_FROM") ?? "Stoga.study <updates@stoga.study>";
const SELF = `${Deno.env.get("SUPABASE_URL")}/functions/v1/release-email`;

type Release = { version: string; date: string; title: string; intro?: string; highlights: { title: string; text: string }[]; fixes?: string[] };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function token(userId: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("UNSUBSCRIBE_SECRET") ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${userId}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function html(r: Release, name: string | null, unsubscribe: string) {
  const items = r.highlights.map((h) => `
    <tr><td style="padding:0 0 14px">
      <div style="font:700 17px/1.3 Arial,sans-serif;color:#1F1B1C">${esc(h.title)}</div>
      <div style="font:15px/1.5 Arial,sans-serif;color:#3F3A3B;margin-top:3px">${esc(h.text)}</div>
    </td></tr>`).join("");
  const fixes = r.fixes?.length
    ? `<p style="font:700 15px Arial,sans-serif;color:#1F1B1C;margin:8px 0 6px">Also fixed</p><ul style="margin:0;padding-left:18px;font:14px/1.5 Arial,sans-serif;color:#3F3A3B">${r.fixes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F4F5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#1E0B0F;padding:28px 28px 26px">
      <div style="font:700 13px Arial,sans-serif;color:#F2A8BA">What's new in Stoga.study · v${esc(r.version)}</div>
      <div style="font:700 28px/1.15 Arial,sans-serif;color:#fff;margin-top:8px">${esc(r.title)}</div>
      ${r.intro ? `<div style="font:15px/1.5 Arial,sans-serif;color:#E9D9DD;margin-top:10px">${esc(r.intro)}</div>` : ""}
    </td></tr>
    <tr><td style="padding:24px 28px 8px">
      <p style="font:15px/1.5 Arial,sans-serif;color:#1F1B1C;margin:0 0 18px">Hi${name ? ` ${esc(name)}` : ""}, here is what changed:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
      ${fixes}
      <p style="margin:24px 0 8px"><a href="${APP_URL}/whats-new" style="display:inline-block;background:#720D19;color:#fff;font:700 15px Arial,sans-serif;text-decoration:none;padding:13px 22px;border-radius:999px">Open Stoga.study</a></p>
      <p style="font:14px/1.5 Arial,sans-serif;color:#636363;margin:16px 0 0">Something not working, or an idea? Reply in the app under Send feedback. We read every one.</p>
    </td></tr>
    <tr><td style="padding:18px 28px 24px;border-top:1px solid #E4E4E7">
      <p style="font:12px/1.5 Arial,sans-serif;color:#8A8A8A;margin:0">You get this because you are in the Stoga.study beta. <a href="${unsubscribe}" style="color:#8A8A8A">Stop update emails</a>.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

function text(r: Release, name: string | null, unsubscribe: string) {
  return [
    `Hi${name ? ` ${name}` : ""}, here is what's new in Stoga.study v${r.version}: ${r.title}`,
    r.intro ?? "",
    ...r.highlights.map((h) => `- ${h.title}: ${h.text}`),
    ...(r.fixes?.length ? ["", "Also fixed:", ...r.fixes.map((f) => `- ${f}`)] : []),
    "", `Open Stoga.study: ${APP_URL}/whats-new`, "", `Stop update emails: ${unsubscribe}`,
  ].join("\n");
}

async function send(to: string, subject: string, body: { html: string; text: string }, unsubscribe: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to: [to], subject, html: body.html, text: body.text,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const page = (title: string, msg: string) =>
  new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px/1.5 Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#1F1B1C"><h1 style="font-size:24px">${title}</h1><p>${msg}</p><p><a href="${APP_URL}" style="color:#720D19">Open Stoga.study</a></p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // One-tap unsubscribe (link in the email, or the mail app's own unsubscribe button).
  const u = url.searchParams.get("u"), t = url.searchParams.get("t");
  if (u && t) {
    if (!/^[0-9a-f-]{36}$/.test(u) || t !== (await token(u))) return page("That link did not work", "It may be incomplete. You can turn update emails off in Settings in the app.");
    await admin.from("profiles").update({ email_updates: false }).eq("user_id", u);
    return page("Update emails are off", "You will not get emails about new updates. You can turn them back on in Settings.");
  }

  if (req.method !== "POST") return new Response("Not found", { status: 404 });
  const adminToken = Deno.env.get("ADMIN_TOKEN");
  if (!adminToken || req.headers.get("x-admin-token") !== adminToken) return new Response("Forbidden", { status: 403 });
  if (!Deno.env.get("RESEND_API_KEY")) return Response.json({ error: "RESEND_API_KEY is not set" }, { status: 500 });
  const body = await req.json().catch(() => ({}));

  const log = await fetch(`${APP_URL}/changelog.json`, { cache: "no-store" }).then((r) => r.json()).catch(() => null) as { releases: Release[] } | null;
  const release = log?.releases.find((r) => r.version === body.version);
  if (!release) return Response.json({ error: `version ${body.version} is not in the changelog` }, { status: 400 });
  const subject = `What's new in Stoga.study: ${release.title}`;

  if (typeof body.test_to === "string") {
    const unsub = `${SELF}?u=00000000-0000-0000-0000-000000000000&t=preview`;
    await send(body.test_to, `[Preview] ${subject}`, { html: html(release, "there", unsub), text: text(release, "there", unsub) }, unsub);
    return Response.json({ sent: 1, preview: true });
  }

  // Everyone with update emails on who has not had this release yet.
  const users: { id: string; email: string }[] = [];
  for (let p = 1; ; p++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: p, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.filter((x) => x.email && !/@example\.com$/i.test(x.email)).map((x) => ({ id: x.id, email: x.email! })));
    if (data.users.length < 1000) break;
  }
  const [{ data: profiles }, { data: done }] = await Promise.all([
    admin.from("profiles").select("user_id, first_name, email_updates"),
    admin.from("release_emails").select("user_id").eq("version", release.version),
  ]);
  const prof = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const already = new Set((done ?? []).map((d) => d.user_id));
  const to = users.filter((x) => prof.get(x.id)?.email_updates !== false && !already.has(x.id));

  let sent = 0;
  const failed: string[] = [];
  for (const x of to) {
    const unsub = `${SELF}?u=${x.id}&t=${await token(x.id)}`;
    const name = prof.get(x.id)?.first_name ?? null;
    try {
      await send(x.email, subject, { html: html(release, name, unsub), text: text(release, name, unsub) }, unsub);
      await admin.from("release_emails").insert({ version: release.version, user_id: x.id });
      sent++;
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, 600)); // Resend allows about 2 a second.
  }
  return Response.json({ sent, skipped: users.length - to.length, failed: failed.length, errors: failed.slice(0, 3) });
});
