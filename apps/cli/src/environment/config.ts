import {
  ConfigError,
  configCodecs,
  createFileConfig,
  defineConfig,
  type Config,
} from "@univer-cli/config";
import type { UnitScreenshotLimits } from "@univer-cli/unit-screenshot";
import type { UniverServerCredentials } from "@univer/collab-gateway";
import { UNIVER_LICENSE, UNIVER_LICENSE_KEY } from "../license.js";
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
  "univerRuntime.licenseKey": {
    codec: configCodecs.nonEmptyString(),
    description: "Key that verifies univerRuntime.license for the Collaboration SDK and Exchange.",
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

/**
 * Resolves the License and its key for the Collaboration SDK and Exchange. Each value comes from
 * its environment variable, then its config key; without a configured License the bundled pair
 * applies. A configured License never borrows the bundled key, because the SDKs reject a pair
 * that was not issued together.
 */
export async function resolveServerCredentials(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UniverServerCredentials> {
  const license = await resolveRuntimeLicense(config, env);
  const configuredKey = env["UNIVER_LICENSE_KEY"]?.trim();
  if (configuredKey !== undefined && configuredKey.length > 0) {
    return { license, licenseKey: configuredKey };
  }
  const entry = await config.get({ key: "univerRuntime.licenseKey" });
  if (entry.source !== "unset" && typeof entry.value === "string") {
    return { license, licenseKey: entry.value };
  }
  if (license === UNIVER_LICENSE) return { license, licenseKey: UNIVER_LICENSE_KEY };
  throw new ConfigError(
    "CONFIG_INVALID_VALUE",
    "A configured Univer license requires its key: set UNIVER_LICENSE_KEY or univerRuntime.licenseKey.",
    { key: "univerRuntime.licenseKey" },
  );
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
