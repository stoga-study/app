import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "./styles/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AuthProvider } from "./lib/auth/session";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  </StrictMode>,
);
