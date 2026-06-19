import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { webcrypto } from "node:crypto";
import { VitePWA } from "vite-plugin-pwa";

if (!(globalThis as { crypto?: { getRandomValues?: unknown } }).crypto?.getRandomValues) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

// ⚠️  DEPLOYMENT FIX:
// Set base to your GitHub repo name so all asset paths resolve correctly.
// e.g. if your repo is github.com/harshithgvsu/wealth-wise → base: "/wealth-wise/"
// For custom domain or root deployment, use base: "/"
const BASE = "/wealth-wise/";

export default defineConfig(() => ({
  base: BASE,
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
      },
      manifest: {
        name: "WealthWise – Personal Finance",
        short_name: "WealthWise",
        description: "Track expenses, get AI insights, and grow your wealth",
        theme_color: "#050507",
        background_color: "#050507",
        display: "standalone",
        orientation: "portrait",
        start_url: BASE,
        icons: [
          {
            src: "favicon.ico",
            sizes: "64x64 32x32 24x24 16x16",
            type: "image/x-icon",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
