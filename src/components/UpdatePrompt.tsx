import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

// A calm, dismissible notice when a new version is ready. Never reloads on its own.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version of Stoga.study is ready.", {
      id: "sw-update",
      duration: Infinity,
      action: { label: "Update", onClick: () => updateServiceWorker() },
      cancel: { label: "Later", onClick: () => setNeedRefresh(false) },
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
