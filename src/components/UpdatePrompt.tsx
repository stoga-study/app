import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

// A calm, dismissible notice when a new version is ready. Never reloads on its own.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
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

  useEffect(() => {
    if (!offlineReady) return;
    toast("Stoga.study is ready to use offline. Saved cards and notes will work without a connection.", { id: "sw-offline" });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  return null;
}
