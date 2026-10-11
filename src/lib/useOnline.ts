import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Whether the device thinks it is online. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
