import { createDaemonServer, type DaemonServer, type JsonValue } from "@univer-cli/daemon";
import { createStandardHeadlessUniverFactory } from "@univer-cli/headless-univer";
import { startServer, type StartedServer } from "@univer/collab-gateway";
import {
  createApplicationConfig,
  resolveGatewayPort,
  resolveRuntimeLicense,
} from "../environment/config.js";
import { registerExchangeHandlers } from "../features/exchange/handlers.js";
import { registerOptimizeHandlers } from "../features/optimize/handlers.js";
import { registerRenderHandlers } from "../features/render/handlers.js";
import { registerTypstHandlers } from "../features/typst/handlers.js";
import { registerUnitHandlers } from "../features/unit/handlers.js";
import { registerUnitContentHandlers } from "../features/unit-content/handlers.js";
import { registerUniverfileHandlers } from "../features/univerfile/handlers.js";
import { registerWorktreeHandlers } from "../features/worktree/handlers.js";
import {
  createLocalCollaborationRuntimePool,
  type LocalCollaborationRuntimePool,
} from "./collaboration-runtime-pool.js";
import { applicationDaemonIdentity } from "./identity.js";
import { resolveApplicationPaths } from "../environment/paths.js";

export interface ApplicationDaemon {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
  close(): Promise<void>;
}

export interface StartApplicationDaemonOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly gatewayPort?: number;
  readonly runtimePool?: LocalCollaborationRuntimePool;
  readonly runtimeWorkerEntry?: string | URL;
  readonly socketPath?: string;
  readonly viewAssetsRoot: string;
}

export async function startApplicationDaemon(
  options: StartApplicationDaemonOptions,
): Promise<ApplicationDaemon> {
  const env = options.env ?? process.env;
  const paths = resolveApplicationPaths(env);
  const config = createApplicationConfig(paths);
  const gateway = await startServer({
    port: options.gatewayPort ?? (await resolveGatewayPort(config, env)),
    viewAssetsRoot: options.viewAssetsRoot,
  });
  const origin = `http://127.0.0.1:${String(gateway.port)}`;
  const info = { origin, port: gateway.port, viewUrl: `${origin}/viewer/` } as JsonValue;
  const license = await resolveRuntimeLicense(config, env);
  const runtimes =
    options.runtimePool ??
    createLocalCollaborationRuntimePool({
      entry: options.runtimeWorkerEntry ?? new URL("./runtime-worker.js", import.meta.url),
      env: {
        ...env,
        UNIVER_LICENSE: license,
      },
      origin,
    });
  const createHeadlessUniver = createStandardHeadlessUniverFactory({ license });
  const daemon = createDaemonServer({
    identity: applicationDaemonIdentity(env),
    socketPath: options.socketPath ?? paths.socketPath,
    onShutdown: async () => {
      await Promise.all([runtimes.close(), gateway.close()]);
    },
  });

  registerUniverfileHandlers({ daemon, gateway, info });
  registerExchangeHandlers({ daemon, gateway, runtimes });
  registerOptimizeHandlers(daemon);
  registerRenderHandlers({ daemon, gateway, runtimes });
  registerTypstHandlers({ createHeadlessUniver, daemon, gateway });
  registerWorktreeHandlers({ daemon, gateway });
  registerUnitHandlers({ daemon, gateway });
  registerUnitContentHandlers({ daemon, gateway, runtimes });

  try {
    await daemon.listen();
  } catch (error) {
    await Promise.all([runtimes.close(), gateway.close()]);
    throw error;
  }

  return {
    daemon,
    gateway,
    async close(): Promise<void> {
      await daemon.close();
    },
  };
}
