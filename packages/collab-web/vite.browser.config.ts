import { fileURLToPath } from "node:url";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import {
  createEmbedUiMenuSchemaAliases,
  createPrismComponentEsmPlugin,
} from "./vite-shared";

const packagesRoot = fileURLToPath(new URL("../", import.meta.url));
const collabWebRoot = fileURLToPath(new URL(".", import.meta.url));
const browserOutDir = join(packagesRoot, "..", "apps", "cli", "dist", "browser");

// One browser build for both local web services: the Viewer UI (collab-web, served by the
// gateway under /collab-web/) and the render page (render-runtime-client). The render SDK's
// static server requires its index.html at the served root, so the render page moves to the
// tree root after the build and both pages share the same chunks/. This config lives in
// collab-web because the browser build toolchain (vite, react, tailwind plugins) is here.
function moveRenderPageToTreeRoot(): import("vite").Plugin {
  return {
    name: "move-render-page-to-tree-root",
    closeBundle() {
      const nestedPageDir = join(browserOutDir, "render-runtime-client");
      renameSync(join(nestedPageDir, "index.html"), join(browserOutDir, "index.html"));
      // The page moved one level up: its tree-relative asset references lose one "../".
      const page = readFileSync(join(browserOutDir, "index.html"), "utf8");
      writeFileSync(join(browserOutDir, "index.html"), page.replaceAll('="../', '="./'));
      rmSync(nestedPageDir, { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  root: packagesRoot,
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: browserOutDir,
    rollupOptions: {
      input: {
        "collab-web/index": join(collabWebRoot, "index.html"),
        "render-runtime-client/index": join(packagesRoot, "render-runtime-client", "index.html"),
      },
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
    target: "esnext",
  },
  define: {
    "process.env": "{}",
  },
  plugins: [react(), tailwindcss(), createPrismComponentEsmPlugin(), moveRenderPageToTreeRoot()],
  resolve: {
    alias: createEmbedUiMenuSchemaAliases(collabWebRoot),
  },
});
