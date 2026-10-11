import { ArrowLeft, Mail } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Seal } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const RESEND_SECONDS = 60;

// Plain, specific messages (Brand Guidelines p. 14). Never "Something went wrong".
function explain(error: { status?: number; code?: string; message: string }) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit")
    return "Several emails were sent just now. Wait a minute, then ask for a new one.";
  if (error.code === "otp_expired") return "That code has expired. Ask for a new email and use the newest code.";
  if (error.code === "validation_failed" || /email/i.test(error.message)) return "That email address does not look right. Check it and try again.";
  return "We could not reach Stoga.study. Check your connection, then try again.";
}

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  async function send(address: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin + from, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(explain(error));
      return;
    }
    setSentTo(address);
    setWait(RESEND_SECONDS);
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError("That email address does not look right. Check it and try again.");
      return;
    }
    await send(address);
  }

  async function onCode(e: FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: "email" });
    setBusy(false);
    if (error) {
      setError(error.code === "otp_expired" ? explain(error) : "That code did not work. Check the newest email, or ask for a new one.");
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-8">
      <div className="flex items-center gap-2">
        {sentTo ? (
          <button type="button" onClick={() => { setSentTo(null); setCode(""); setError(null); }} className="grid size-11 place-items-center rounded-full" aria-label="Use a different email">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Link to="/welcome" className="grid size-11 place-items-center rounded-full text-ink" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        )}
        <Seal size={32} />
      </div>

      {!sentTo ? (
        <form onSubmit={onEmail} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-[2rem]">Sign in with your email</h1>
            <p className="mt-2 text-muted">We will email you a sign-in link and a code. No password to remember.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "signin-error" : undefined}
              placeholder="you@example.com"
            />
          </div>
          {error && <p id="signin-error" role="alert" className="callout"><span>{error}</span></p>}
          <Button type="submit" block disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</Button>
        </form>
      ) : (
        <form onSubmit={onCode} noValidate className="flex flex-col gap-5">
          <span className="tile soft"><Mail /></span>
          <div>
            <h1 className="text-[2rem]">Check your email</h1>
            <p className="mt-2 text-ink-2">
              We sent a link to <b className="break-all">{sentTo}</b>. Tap it to sign in, or enter the 6-digit code here.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="field-label">6-digit code</label>
            <input
              id="code"
              ref={codeRef}
              className="input tabular text-center !text-[1.5rem] font-bold tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-invalid={!!error}
              aria-describedby={error ? "code-error" : "code-hint"}
            />
            <p id="code-hint" className="field-hint">The code and link work once and expire in an hour.</p>
          </div>
          {error && <p id="code-error" role="alert" className="callout"><span>{error}</span></p>}
          <Button type="submit" block disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</Button>
          <Button variant="ghost" block disabled={busy || wait > 0} onClick={() => send(sentTo)}>
            {wait > 0 ? <span className="tabular">Send a new email in {wait}s</span> : "Send a new email"}
          </Button>
          <p className="text-center text-[0.875rem] text-muted">Not there? Check your spam or promotions folder.</p>
        </form>
      )}
    </main>
  );
}
