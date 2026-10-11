import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { flush, onPendingChange, pendingCount } from "@/lib/offline/outbox";
import { useOnline } from "@/lib/useOnline";

/** A calm notice while offline, and while reviews are waiting to sync. */
export function OfflineBanner() {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void pendingCount().then(setPending);
    const off = onPendingChange(setPending);
    return () => { off(); };
  }, []);
  if (online && pending === 0) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-[1rem] bg-soft px-4 py-3 text-[0.9375rem]">
      {online ? <RefreshCw className="size-5 flex-none text-brand" /> : <WifiOff className="size-5 flex-none text-brand" />}
      <span className="flex-1">
        {online
          ? `Syncing ${pending} ${pending === 1 ? "review" : "reviews"}…`
          : `You are offline. Saved cards, notes and quizzes still work.${pending ? ` ${pending} ${pending === 1 ? "review" : "reviews"} will sync when you reconnect.` : ""}`}
      </span>
      {online && pending > 0 && <button type="button" className="font-bold text-brand" onClick={() => void flush()}>Retry</button>}
    </div>
  );
}
