import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    ...(process.env.VERCEL ? [] : [cloudflare()]),
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: {
      overlay: false,
    },
  },
  build: {
    outDir: process.env.VERCEL ? "dist" : "dist/client",
    emptyOutDir: true,
  },
});
