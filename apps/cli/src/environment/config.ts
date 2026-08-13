import { configCodecs, createFileConfig, defineConfig, type Config } from "@univer-cli/config";
import type { UnitScreenshotLimits } from "@univer-cli/unit-screenshot";
import { UNIVER_LICENSE } from "../license.js";
import type { ApplicationPaths } from "./paths.js";

const DEFAULT_GATEWAY_PORT = 9123;

const definitions = defineConfig({
  "collabGateway.port": {
    codec: configCodecs.integer({ minimum: 1, maximum: 65_535 }),
    defaultValue: DEFAULT_GATEWAY_PORT,
    description: "Loopback Collaboration Gateway port.",
  },
  "screenshot.maxPages": {
    codec: configCodecs.integer({ minimum: 1 }),
    description: "Maximum pages rendered by one screenshot command.",
  },
  "screenshot.maxPixels": {
    codec: configCodecs.integer({ minimum: 1 }),
    description: "Maximum total pixels rendered by one screenshot command.",
  },
  "update.checkOnStartup": {
    codec: configCodecs.boolean(),
    description: "Check for CLI updates at startup.",
  },
  "univerRuntime.license": {
    codec: configCodecs.nonEmptyString(),
    description: "Univer runtime license used by local headless workers.",
  },
});

export function createApplicationConfig(paths: ApplicationPaths): Config {
  return createFileConfig({ definitions, path: paths.configPath });
}
export async function resolveGatewayPort(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const configuredByEnvironment = env["UNIVER_COLLAB_GATEWAY_PORT"]?.trim();
  if (configuredByEnvironment !== undefined && configuredByEnvironment.length > 0) {
    return configCodecs.integer({ minimum: 1, maximum: 65_535 }).parseText(configuredByEnvironment);
  }
  const entry = await config.get({ key: "collabGateway.port" });
  if (entry.source === "unset" || typeof entry.value !== "number") return DEFAULT_GATEWAY_PORT;
  return entry.value;
}

export async function resolveRuntimeLicense(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const configuredByEnvironment = env["UNIVER_LICENSE"]?.trim();
  if (configuredByEnvironment !== undefined && configuredByEnvironment.length > 0) {
    return configuredByEnvironment;
  }
  const entry = await config.get({ key: "univerRuntime.license" });
  if (entry.source === "unset") return UNIVER_LICENSE;
  return typeof entry.value === "string" ? entry.value : UNIVER_LICENSE;
}

export async function resolveScreenshotLimits(
  config: Config,
): Promise<Partial<UnitScreenshotLimits>> {
  const [pages, pixels] = await Promise.all([
    config.get({ key: "screenshot.maxPages" }),
    config.get({ key: "screenshot.maxPixels" }),
  ]);
  return {
    ...(pages.source !== "unset" && typeof pages.value === "number"
      ? { maxPages: pages.value }
      : {}),
    ...(pixels.source !== "unset" && typeof pixels.value === "number"
      ? { maxPixels: pixels.value }
      : {}),
  };
}
