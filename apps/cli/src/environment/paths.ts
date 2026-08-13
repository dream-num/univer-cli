import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const MAX_PREFERRED_SOCKET_PATH_LENGTH = 70;
const WINDOWS_NAMED_PIPE_PREFIX = "\\\\.\\pipe\\";

export interface ApplicationPaths {
  readonly configPath: string;
  readonly daemonDir: string;
  readonly homeDir: string;
  readonly socketPath: string;
}

export function resolveApplicationPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ApplicationPaths {
  const homeDir = resolveUniverHome(env);
  const daemonDir = join(homeDir, "daemon");
  return {
    configPath: join(homeDir, "config.json"),
    daemonDir,
    homeDir,
    socketPath: resolveDaemonSocketPath(homeDir, platform),
  };
}

export function resolveUniverHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["UNIVER_HOME"]?.trim();
  if (configured) return resolve(configured);
  const fallback = env["HOME"]?.trim() || env["USERPROFILE"]?.trim() || homedir();
  if (!fallback) throw new Error("Cannot resolve home directory for UNIVER_HOME fallback");
  return resolve(fallback, ".univer");
}

export function resolveDaemonSocketPath(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const preferred = join(homeDir, "daemon", "daemon.sock");
  if (platform === "win32") {
    return `${WINDOWS_NAMED_PIPE_PREFIX}univer-daemon-${hashPath(preferred)}`;
  }
  return preferred.length <= MAX_PREFERRED_SOCKET_PATH_LENGTH
    ? preferred
    : join("/tmp", `univer-${hashPath(preferred)}.sock`);
}

function hashPath(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}
