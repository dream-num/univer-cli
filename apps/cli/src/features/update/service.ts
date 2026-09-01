import type { DaemonControl } from "@univer-cli/daemon";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const UPDATE_CACHE_SCHEMA_VERSION = 1;
const PACKAGE_NAME = "univer-cli";
const UPDATE_REGISTRY = "https://registry.npmjs.org/" as const;

export type ReleaseChannel = "stable";

export interface UpdateTarget {
  readonly channel: ReleaseChannel;
  readonly distTag: "latest";
  readonly packageName: typeof PACKAGE_NAME;
  readonly registryUrl: typeof UPDATE_REGISTRY;
}

export interface UpdateCheckResult {
  readonly channel: ReleaseChannel;
  readonly checkedAt: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly target: UpdateTarget;
  readonly updateAvailable: boolean;
}

export interface UpdateResult extends UpdateCheckResult {
  readonly status: "up-to-date" | "updated";
}

export interface UpdateApplication {
  check(): Promise<UpdateCheckResult>;
  update(input: {
    readonly force: boolean;
    readonly progress: (message: string) => void;
  }): Promise<UpdateResult>;
}

export interface UpdateCacheEntry {
  readonly checkedAt: string;
  readonly diagnostic?: string;
  readonly distTag: UpdateTarget["distTag"];
  readonly latestVersion?: string;
  readonly packageName: typeof PACKAGE_NAME;
  readonly registryUrl: UpdateTarget["registryUrl"];
  readonly schemaVersion: typeof UPDATE_CACHE_SCHEMA_VERSION;
}

export interface LocalUpdateApplicationOptions {
  readonly control: DaemonControl;
  readonly fetchRegistry?: (url: string) => Promise<unknown>;
  readonly homeDir: string;
  readonly now?: () => Date;
  readonly packageRoot: string;
  readonly runInstaller?: (input: {
    readonly packageSpec: string;
    readonly registryUrl: string;
  }) => Promise<{ readonly exitCode: number; readonly stderr?: string }>;
  readonly version: string;
}

export class UpdateError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "UpdateError";
  }
}

export function createLocalUpdateApplication(
  options: LocalUpdateApplicationOptions,
): UpdateApplication {
  const check = async (): Promise<UpdateCheckResult> => {
    await assertReleaseInstallation(options.packageRoot);
    const refreshed = await refreshUpdateCache({
      ...(options.fetchRegistry === undefined ? {} : { fetchRegistry: options.fetchRegistry }),
      homeDir: options.homeDir,
      now: options.now?.() ?? new Date(),
      version: options.version,
    });
    if (refreshed.latestVersion === undefined) {
      throw new UpdateError(
        "CLI_UPDATE_CHECK_FAILED",
        "Could not verify the latest Univer CLI version.",
        refreshed.diagnostic === undefined ? undefined : { diagnostic: refreshed.diagnostic },
      );
    }
    return toCheckResult(options.version, refreshed.target, {
      ...refreshed,
      latestVersion: refreshed.latestVersion,
    });
  };

  return {
    check,
    async update(input): Promise<UpdateResult> {
      const result = await check();
      if (!result.updateAvailable) return { ...result, status: "up-to-date" };

      const daemon = await options.control.status();
      if (daemon.state !== "stopped" && input.force !== true) {
        throw new UpdateError(
          "CLI_UPDATE_FORCE_REQUIRED",
          "The Univer daemon must be stopped before updating. Run `univer update --force` to stop it and continue.",
        );
      }
      if (daemon.state !== "stopped") await options.control.stop();

      const packageSpec = `${result.target.packageName}@${result.latestVersion}`;
      input.progress(`Updating Univer CLI via npm (${result.channel} channel)...`);
      const installed = await (options.runInstaller ?? runNpmInstaller)({
        packageSpec,
        registryUrl: result.target.registryUrl,
      });
      if (installed.exitCode !== 0) {
        throw new UpdateError(
          "CLI_UPDATE_INSTALL_FAILED",
          "npm could not install the verified Univer CLI update.",
          installed.stderr === undefined ? undefined : { diagnostic: installed.stderr },
        );
      }
      return { ...result, status: "updated" };
    },
  };
}

export async function isDevelopmentInstallation(packageRoot: string): Promise<boolean> {
  let packageMetadata: unknown;
  try {
    packageMetadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  } catch {
    return true;
  }
  if (!isRecord(packageMetadata) || packageMetadata["name"] !== PACKAGE_NAME) return true;
  if (packageMetadata["private"] === true) return true;
  const [source, buildScript] = await Promise.all([
    pathExists(join(packageRoot, "src")),
    pathExists(join(packageRoot, "scripts", "build.mjs")),
  ]);
  return source && buildScript;
}

async function assertReleaseInstallation(packageRoot: string): Promise<void> {
  if (!(await isDevelopmentInstallation(packageRoot))) return;
  throw new UpdateError(
    "CLI_UPDATE_DEVELOPMENT_LINK",
    "This Univer CLI checkout is linked for development and cannot update itself. Run `pnpm unlink:cli`, then install a published Univer CLI package.",
  );
}

export function resolveUpdateTarget(version: string): UpdateTarget {
  // Any released stable version qualifies, so installs of older public lines can update forward.
  if (/^\d+\.\d+\.\d+$/u.test(version)) {
    return {
      channel: "stable",
      distTag: "latest",
      packageName: PACKAGE_NAME,
      registryUrl: UPDATE_REGISTRY,
    };
  }
  throw new UpdateError(
    "CLI_UPDATE_CHANNEL_UNSUPPORTED",
    `Version ${version} is a development build; \`univer update\` applies only to stable releases. Install development builds manually.`,
  );
}

export async function refreshUpdateCache(input: {
  readonly fetchRegistry?: (url: string) => Promise<unknown>;
  readonly homeDir: string;
  readonly now?: Date;
  readonly version: string;
}): Promise<{ readonly target: UpdateTarget } & UpdateCacheEntry> {
  const target = resolveUpdateTarget(input.version);
  const checkedAt = (input.now ?? new Date()).toISOString();
  let update:
    | { readonly diagnostic: string; readonly latestVersion?: undefined }
    | { readonly diagnostic?: undefined; readonly latestVersion: string };
  try {
    const metadata = await (input.fetchRegistry ?? fetchRegistry)(registryMetadataUrl(target));
    update = readRegistryVersion(metadata, target);
  } catch (error) {
    update = {
      diagnostic: `Version source unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const entry: UpdateCacheEntry = {
    checkedAt,
    ...(update.diagnostic === undefined ? {} : { diagnostic: update.diagnostic }),
    distTag: target.distTag,
    ...(update.latestVersion === undefined ? {} : { latestVersion: update.latestVersion }),
    packageName: target.packageName,
    registryUrl: target.registryUrl,
    schemaVersion: UPDATE_CACHE_SCHEMA_VERSION,
  };
  await writeUpdateCache(updateCachePath(input.homeDir), entry);
  return { ...entry, target };
}

export async function readUpdateCache(homeDir: string): Promise<UpdateCacheEntry | null> {
  try {
    return parseUpdateCache(JSON.parse(await readFile(updateCachePath(homeDir), "utf8")));
  } catch {
    return null;
  }
}

export function updateCachePath(homeDir: string): string {
  return join(homeDir, "updates", "latest.json");
}

export function cacheMatchesTarget(entry: UpdateCacheEntry, target: UpdateTarget): boolean {
  return (
    entry.packageName === target.packageName &&
    entry.registryUrl === target.registryUrl &&
    entry.distTag === target.distTag
  );
}

export function isUpdateCacheFresh(
  entry: UpdateCacheEntry,
  now: Date,
  ttlMs = UPDATE_CACHE_TTL_MS,
): boolean {
  const checkedAt = Date.parse(entry.checkedAt);
  return Number.isFinite(checkedAt) && now.getTime() - checkedAt <= ttlMs;
}

export function isNewerVersion(currentVersion: string, candidateVersion: string): boolean {
  const current = parseVersion(currentVersion);
  const candidate = parseVersion(candidateVersion);
  if (current === undefined || candidate === undefined) {
    throw new UpdateError(
      "CLI_UPDATE_VERSION_INVALID",
      `Cannot compare Univer CLI versions ${currentVersion} and ${candidateVersion}.`,
    );
  }
  return compareVersions(current, candidate) < 0;
}

export async function releaseBackgroundUpdateLock(env: NodeJS.ProcessEnv): Promise<void> {
  const lockPath = env["UNIVER_CLI_UPDATE_CHECK_LOCK"]?.trim();
  if (lockPath !== undefined && lockPath.length > 0) await rm(lockPath, { force: true });
}

function toCheckResult(
  currentVersion: string,
  target: UpdateTarget,
  entry: UpdateCacheEntry & { readonly latestVersion: string },
): UpdateCheckResult {
  return {
    channel: target.channel,
    checkedAt: entry.checkedAt,
    currentVersion,
    latestVersion: entry.latestVersion,
    target,
    updateAvailable: isNewerVersion(currentVersion, entry.latestVersion),
  };
}

function readRegistryVersion(
  metadata: unknown,
  target: UpdateTarget,
):
  | { readonly diagnostic: string; readonly latestVersion?: undefined }
  | { readonly diagnostic?: undefined; readonly latestVersion: string } {
  if (!isRecord(metadata) || !isRecord(metadata["dist-tags"])) {
    return { diagnostic: "Registry metadata is missing dist tags." };
  }
  const latestVersion = metadata["dist-tags"][target.distTag];
  if (typeof latestVersion !== "string" || latestVersion.length === 0) {
    return { diagnostic: `Registry metadata is missing dist tag ${target.distTag}.` };
  }
  if (!isRecord(metadata["versions"]) || !isRecord(metadata["versions"][latestVersion])) {
    return { diagnostic: `Registry metadata is missing version ${latestVersion}.` };
  }
  const dist = metadata["versions"][latestVersion]["dist"];
  if (!isRecord(dist) || typeof dist["tarball"] !== "string" || dist["tarball"].length === 0) {
    return { diagnostic: `Registry metadata for ${latestVersion} is not installable.` };
  }
  if (parseVersion(latestVersion) === undefined) {
    return { diagnostic: `Registry dist tag ${target.distTag} contains an invalid version.` };
  }
  try {
    if (resolveUpdateTarget(latestVersion).channel !== target.channel) {
      return {
        diagnostic: `Registry dist tag ${target.distTag} points outside the ${target.channel} channel.`,
      };
    }
  } catch {
    return { diagnostic: `Registry dist tag ${target.distTag} contains an unsupported channel.` };
  }
  return { latestVersion };
}

function registryMetadataUrl(target: UpdateTarget): string {
  return new URL(target.packageName, target.registryUrl).toString();
}

async function fetchRegistry(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as unknown;
}

async function writeUpdateCache(path: string, entry: UpdateCacheEntry): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporaryPath = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(entry, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

function parseUpdateCache(value: unknown): UpdateCacheEntry | null {
  if (
    !isRecord(value) ||
    value["schemaVersion"] !== UPDATE_CACHE_SCHEMA_VERSION ||
    typeof value["checkedAt"] !== "string" ||
    value["distTag"] !== "latest" ||
    value["packageName"] !== PACKAGE_NAME ||
    value["registryUrl"] !== UPDATE_REGISTRY ||
    (value["latestVersion"] !== undefined && typeof value["latestVersion"] !== "string") ||
    (value["diagnostic"] !== undefined && typeof value["diagnostic"] !== "string")
  ) {
    return null;
  }
  return value as unknown as UpdateCacheEntry;
}

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(version);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const normal = compareNormalVersions(left, right);
  if (normal !== 0) return normal;
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = numericIdentifier(leftPart);
    const rightNumber = numericIdentifier(rightPart);
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return compareNumber(leftNumber, rightNumber);
    }
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function compareNormalVersions(left: ParsedVersion, right: ParsedVersion): number {
  return (
    compareNumber(left.major, right.major) ||
    compareNumber(left.minor, right.minor) ||
    compareNumber(left.patch, right.patch)
  );
}

function numericIdentifier(value: string): number | undefined {
  return /^(?:0|[1-9]\d*)$/u.test(value) ? Number(value) : undefined;
}

function compareNumber(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

async function runNpmInstaller(input: {
  readonly packageSpec: string;
  readonly registryUrl: string;
}): Promise<{ readonly exitCode: number; readonly stderr?: string }> {
  return await new Promise((resolve) => {
    let stderr = "";
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--global", input.packageSpec, `--registry=${input.registryUrl}`],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => resolve({ exitCode: 1, stderr: error.message }));
    child.once("close", (code) =>
      resolve({
        exitCode: code ?? 1,
        ...(stderr.trim().length === 0 ? {} : { stderr: stderr.trim() }),
      }),
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
