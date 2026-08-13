import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { createEmbedUiMenuSchemaAliases, createPrismComponentEsmPlugin } from "./vite-shared";

const root = dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.UCB_SERVER ?? "http://127.0.0.1:8000";
const embedUiMenuSchemaAliases = createEmbedUiMenuSchemaAliases(root);

// The browser app stays same-origin and proxies everything under `/uf` (HTTP + WebSocket)
// to the gateway, so collaboration-client's snapshot/comb URLs and lifecycle events all
// resolve without CORS. `buildRuntimeConfig({ origin: location.origin })` then points at this
// dev server, which forwards to TARGET.
export default defineConfig({
  root,
  build: {
    target: "esnext"
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/uf": {
        target: TARGET,
        changeOrigin: true,
        ws: true
      }
    }
  },
  define: {
    "process.env": "{}"
  },
  resolve: {
    alias: embedUiMenuSchemaAliases
  },
  plugins: [react(), tailwindcss(), createPrismComponentEsmPlugin()]
});
