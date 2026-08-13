import { cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesRoot = join(projectRoot, "..", "..", "packages");
const runtimeSource = join(packagesRoot, "render-runtime-client", "dist");
const runtimeDestination = join(projectRoot, "dist", "render-runtime");
const viewSource = join(packagesRoot, "collab-web", "dist");
const viewDestination = join(projectRoot, "dist", "collab-web");

await Promise.all([
  rm(runtimeDestination, { force: true, recursive: true }),
  rm(viewDestination, { force: true, recursive: true }),
]);
await Promise.all([
  cp(runtimeSource, runtimeDestination, { recursive: true }),
  cp(viewSource, viewDestination, { recursive: true }),
]);
