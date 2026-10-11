import { AlertCircle } from "lucide-react";
import { useRouteError } from "react-router";
import { Button } from "./ui/button";

/** Shown if a screen hits an unexpected problem. Plain words, a way forward, and no lost work. */
export function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <span className="tile t4"><AlertCircle /></span>
      <h1 className="text-[2rem]">This screen hit a problem</h1>
      <p className="text-muted">Reload to try again. Your notes, cards and progress are safe. If it keeps happening, tell us from Settings, Send feedback.</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/")}>Go to today</Button>
      </div>
    </main>
  );
}
