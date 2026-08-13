import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

// 机器页面由 daemon 的本地静态服务托管,相对 base 保证任意挂载路径可用。
export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 20000,
  },
  define: {
    "process.env": "{}",
  },
});
