/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before swapping in a new version, so nobody loses a half-finished quiz.
      registerType: "prompt",
      includeAssets: ["icons/seal.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Stoga.study",
        short_name: "Stoga",
        description: "Free, calm study help from your own notes.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F4F4F5",
        theme_color: "#720D19",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        navigateFallback: "/index.html",
        // pdf.js ships a large worker; it is fetched on demand, not precached.
        globIgnores: ["**/pdf.worker*"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"], passWithNoTests: true },
});
