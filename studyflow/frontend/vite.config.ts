import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Phone build (`vite build --mode artifact`): one self-contained HTML file that runs
// inside a claude.ai Artifact, with the planner logic running in the page (no server).
const artifact: UserConfig = {
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { "import.meta.env.VITE_ARTIFACT": JSON.stringify("1") },
  resolve: { alias: [{ find: /^\.\/backend-select$/, replacement: src("local/backend-select.ts") }] },
  build: { outDir: "dist-artifact", emptyOutDir: true, rollupOptions: { input: "artifact.html" } },
};

// Web build: talks to the FastAPI server; installable PWA.
const web: UserConfig = {
  plugins: [
    react(),
    tailwindcss(),
    // Makes StudyFlow installable ("Install app" in Chrome/Edge, "Add to Home Screen" on iOS)
    // and caches the app shell so it opens instantly, even offline.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "StudyFlow",
        short_name: "StudyFlow",
        description: "Turn your syllabus into an adaptive study plan, get quizzed, and track your progress.",
        start_url: "/today",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0e0f13",
        theme_color: "#16161d",
        categories: ["education", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Today", url: "/today", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
          { name: "Progress", url: "/dashboard", icons: [{ src: "pwa-192x192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // API responses are always fetched live - never serve stale plans or scores.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router"],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
};

export default defineConfig(({ mode }) => (mode === "artifact" ? artifact : web));
