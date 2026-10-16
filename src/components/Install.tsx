import { Download, Share, SquarePlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { promptInstall, snooze, snoozed, useInstall } from "@/lib/install";
import { useSources } from "@/lib/queries/sources";

function IosSteps() {
  return (
    <ol className="mt-3 flex flex-col gap-2 text-[0.9375rem]">
      <li className="flex items-center gap-2"><span className="grid size-7 flex-none place-items-center rounded-full bg-tint font-bold text-brand">1</span> Tap <Share className="size-5 flex-none" aria-label="Share" /> in Safari's toolbar</li>
      <li className="flex items-center gap-2"><span className="grid size-7 flex-none place-items-center rounded-full bg-tint font-bold text-brand">2</span> Scroll down and tap <b>Add to Home Screen</b> <SquarePlus className="size-5 flex-none" aria-hidden="true" /></li>
      <li className="flex items-center gap-2"><span className="grid size-7 flex-none place-items-center rounded-full bg-tint font-bold text-brand">3</span> Tap <b>Add</b>, then open Stoga from your Home Screen</li>
    </ol>
  );
}

/** The install offer. On Home it waits for a good moment (a first study set is ready) and can be snoozed. */
export function InstallCard({ where }: { where: "home" | "settings" }) {
  const way = useInstall();
  const sources = useSources();
  const [closed, setClosed] = useState(snoozed);
  const [steps, setSteps] = useState(false);
  const hasSet = (sources.data ?? []).some((s) => s.status === "ready");
  if (where === "home" && (closed || !hasSet || (way !== "prompt" && way !== "ios"))) return null;
  if (where === "settings") {
    if (way === "installed") return <p className="text-muted">Stoga.study is installed on this device.</p>;
    if (way === "none") return <p className="text-muted">Open Stoga.study in Chrome, Edge or Safari on your phone to add it to your Home Screen.</p>;
  }
  const install = async () => {
    if (way === "ios") return setSteps((x) => !x);
    if (await promptInstall()) toast("Installed. Find Stoga.study with your other apps.");
  };
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="tile soft"><Download /></span>
        <p className="min-w-[12rem] flex-1">
          <b className="block">Put Stoga.study on your Home Screen</b>
          <span className="text-[0.9375rem] text-muted">It opens like an app, works offline{way === "ios" ? ", and can send you reminders" : ""}.</span>
        </p>
        <Button size="sm" onClick={() => void install()}>{way === "ios" ? (steps ? "Hide the steps" : "Show me how") : "Install"}</Button>
      </div>
      {way === "ios" && steps && <IosSteps />}
    </>
  );
  if (where === "settings") return <div>{body}</div>;
  return (
    <section className="card relative mb-4 p-5 pr-12" aria-label="Install the app">
      {body}
      <button type="button" aria-label="Not now" onClick={() => { snooze(); setClosed(true); }} className="absolute right-2 top-2 grid size-10 place-items-center rounded-full hover:bg-soft"><X className="size-5" /></button>
    </section>
  );
}
