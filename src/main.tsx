import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "./styles/index.css";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthProvider } from "./lib/auth/session";
import { CACHE_VERSION, MAX_AGE, persister, shouldKeep } from "./lib/offline/persist";
import { router } from "./router";

const queryClient = new QueryClient({
  // gcTime must cover the offline window, or persisted data would be dropped before it is restored.
  defaultOptions: { queries: { staleTime: 30_000, gcTime: MAX_AGE, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: MAX_AGE, buster: CACHE_VERSION, dehydrateOptions: { shouldDehydrateQuery: shouldKeep } }}
      // The saved copy shows instantly (and offline); check every screen against the server once per start.
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster
        position="bottom-center"
        mobileOffset={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}
        toastOptions={{ className: "font-body" }}
        style={{ "--normal-bg": "var(--card)", "--normal-text": "var(--ink)", "--normal-border": "var(--line)" } as React.CSSProperties}
      />
      <UpdatePrompt />
    </PersistQueryClientProvider>
  </StrictMode>,
);
