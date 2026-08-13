#!/usr/bin/env node
import { DAEMON_SOCKET_ENV } from "@univer-cli/daemon";
import { fileURLToPath } from "node:url";
import { startApplicationDaemon } from "./daemon/server.js";
import { writeDaemonStartupDiagnostic } from "./daemon/startup-diagnostic.js";

const socketPath = process.env[DAEMON_SOCKET_ENV];
if (!socketPath) throw new Error(`${DAEMON_SOCKET_ENV} is required`);

const viewAssetsRoot =
  process.env["UNIVER_CLI_VIEW_ASSETS_ROOT"] ??
  fileURLToPath(new URL("./collab-web/", import.meta.url));
const application = await startApplicationDaemon({
  env: process.env,
  runtimeWorkerEntry: new URL("./runtime-worker.js", import.meta.url),
  socketPath,
  viewAssetsRoot,
}).catch(async (error: unknown) => {
  await writeDaemonStartupDiagnostic(socketPath, error);
  throw error;
});

let closing = false;
const close = (): void => {
  if (closing) return;
  closing = true;
  void application.close().catch(() => {
    process.exitCode = 1;
  });
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
