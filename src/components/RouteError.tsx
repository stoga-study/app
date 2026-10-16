import { AlertCircle, Check, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouteError } from "react-router";
import { isChunkError } from "@/lib/retry";
import { supabase } from "@/lib/supabase";
import { Button } from "./ui/button";

const RELOADED = "stoga-chunk-reload";

/** Shown if a screen hits an unexpected problem. Plain words, a way forward, and no lost work. */
export function RouteError() {
  const error = useRouteError();
  const [sent, setSent] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const chunk = isChunkError(error);
  console.error(error);

  // A new version went out and this screen's code file is gone: load the new version once, quietly.
  useEffect(() => {
    if (!chunk) return;
    try {
      if (sessionStorage.getItem(RELOADED) === location.pathname) return;
      sessionStorage.setItem(RELOADED, location.pathname);
    } catch {
      /* no storage: reload anyway, once per render of this screen */
    }
    window.location.reload();
  }, [chunk]);

  const report = async () => {
    setSent("sending");
    const e = error as { message?: string; stack?: string; status?: number; statusText?: string } | undefined;
    const body = [
      `Screen error on ${location.pathname}`,
      e?.message ?? e?.statusText ?? String(error),
      e?.stack?.split("\n").slice(0, 8).join("\n") ?? "",
      `Build: ${document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src.split("/").pop() ?? "?"} · ${navigator.userAgent}`,
    ].filter(Boolean).join("\n\n").slice(0, 3900);
    const { error: err } = await supabase.from("feedback").insert({ kind: "bug", body, page: location.pathname.slice(0, 200) });
    setSent(err ? "failed" : "sent");
  };

  if (chunk) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5"><p className="text-muted">Loading the newest version…</p></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <span className="tile t4"><AlertCircle /></span>
      <h1 className="text-[2rem]">This screen hit a problem</h1>
      <p className="text-muted">Reload to try again. Your notes, cards and progress are safe.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/")}>Go to today</Button>
        <Button variant="ghost" disabled={sent === "sending" || sent === "sent"} onClick={() => void report()}>
          {sent === "sent" ? <><Check /> Report sent, thank you</> : <><Send /> {sent === "failed" ? "Couldn't send. Try again" : "Send a report"}</>}
        </Button>
      </div>
      <p className="text-[0.875rem] text-muted">A report sends what went wrong and on which screen, nothing from your notes.</p>
    </main>
  );
}
