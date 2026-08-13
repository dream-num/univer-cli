import type { Config } from "@univer-cli/config";
import { spawn } from "node:child_process";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cacheMatchesTarget,
  isNewerVersion,
  isDevelopmentInstallation,
  isUpdateCacheFresh,
  readUpdateCache,
  resolveUpdateTarget,
  UPDATE_CACHE_TTL_MS,
} from "./service.js";

const CHECK_LOCK_STALE_MS = 10 * 60 * 1000;
const TIP_THROTTLE_MS = 30 * 60 * 1000;
const TIP_SCHEMA_VERSION = 1;

export interface StartupUpdateCheckOptions {
  readonly config: Config;
  readonly entryPath: string | undefined;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly interactive: boolean;
  readonly json: boolean;
  readonly now?: Date;
  readonly packageRoot: string;
  readonly spawnChecker?: (
    command: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ) => void;
  readonly version: string;
  readonly writeErr: (text: string) => void;
}

export async function checkForUpdateAtStartup(options: StartupUpdateCheckOptions): Promise<void> {
  try {
    await checkForUpdateAtStartupSafely(options);
  } catch {
    // Update discovery must never block the command the user actually requested.
  }
}

async function checkForUpdateAtStartupSafely(options: StartupUpdateCheckOptions): Promise<void> {
  if (!options.interactive || options.json || updateCheckDisabledByEnvironment(options.env)) return;
  if (await isDevelopmentInstallation(options.packageRoot)) return;
  const configured = await options.config.get({ key: "update.checkOnStartup" }).catch(() => null);
  if (configured !== null && configured.source !== "unset" && configured.value === false) return;

  let target;
  try {
    target = resolveUpdateTarget(options.version);
  } catch {
    return;
  }
  const now = options.now ?? new Date();
  const cached = await readUpdateCache(options.homeDir);
  if (
    cached !== null &&
    cacheMatchesTarget(cached, target) &&
    isUpdateCacheFresh(cached, now, UPDATE_CACHE_TTL_MS)
  ) {
    if (
      cached.latestVersion !== undefined &&
      isNewerVersion(options.version, cached.latestVersion) &&
      (await shouldShowTip(options.homeDir, cached.latestVersion, now))
    ) {
      options.writeErr(
        `Newer Univer CLI v${cached.latestVersion} is available on the ${target.channel} channel; run \`univer update\`.\n`,
      );
      await markTipShown(options.homeDir, cached.latestVersion, now);
    }
    return;
  }
  await startBackgroundChecker(options, now);
}

async function startBackgroundChecker(
  options: StartupUpdateCheckOptions,
  now: Date,
): Promise<void> {
  if (options.entryPath === undefined || /\.(?:ts|tsx)$/u.test(options.entryPath)) return;
  const lockPath = join(options.homeDir, "updates", "check.lock");
  if (!(await acquireLock(lockPath, now))) return;
  try {
    const env = {
      ...options.env,
      UNIVER_CLI_INTERNAL_UPDATE_CHECK: "1",
      UNIVER_CLI_UPDATE_CHECK_LOCK: lockPath,
    };
    if (options.spawnChecker === undefined) {
      const child = spawn(process.execPath, [options.entryPath], {
        detached: true,
        env,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } else {
      options.spawnChecker(process.execPath, [options.entryPath], env);
    }
  } catch {
    await rm(lockPath, { force: true });
  }
}

async function acquireLock(lockPath: string, now: Date): Promise<boolean> {
  await mkdir(dirname(lockPath), { mode: 0o700, recursive: true });
  if (await createLock(lockPath, now)) return true;
  const existing = await stat(lockPath).catch(() => null);
  if (existing === null || now.getTime() - existing.mtimeMs > CHECK_LOCK_STALE_MS) {
    await rm(lockPath, { force: true });
    return await createLock(lockPath, now);
  }
  return false;
}

async function createLock(lockPath: string, now: Date): Promise<boolean> {
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
    await writeFile(
      handle,
      `${JSON.stringify({ pid: process.pid, startedAt: now.toISOString() })}\n`,
    );
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") return false;
    throw error;
  } finally {
    await handle?.close();
  }
}

async function shouldShowTip(homeDir: string, version: string, now: Date): Promise<boolean> {
  try {
    const value: unknown = JSON.parse(await readFile(tipPath(homeDir), "utf8"));
    if (!isRecord(value) || value["schemaVersion"] !== TIP_SCHEMA_VERSION) return true;
    const shownAt = typeof value["shownAt"] === "string" ? Date.parse(value["shownAt"]) : NaN;
    return (
      value["latestVersion"] !== version ||
      !Number.isFinite(shownAt) ||
      now.getTime() - shownAt > TIP_THROTTLE_MS
    );
  } catch {
    return true;
  }
}

async function markTipShown(homeDir: string, version: string, now: Date): Promise<void> {
  const path = tipPath(homeDir);
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      { latestVersion: version, schemaVersion: TIP_SCHEMA_VERSION, shownAt: now.toISOString() },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function tipPath(homeDir: string): string {
  return join(homeDir, "updates", "tip.json");
}

function updateCheckDisabledByEnvironment(env: NodeJS.ProcessEnv): boolean {
  const value = env["UNIVER_CLI_UPDATE_CHECK"]?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "off";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
