import type { Config } from "@univer-cli/config";
import type { DaemonControl } from "@univer-cli/daemon";
import type { UniverRenderBrowserSetupCommandDependencies } from "@univer-cli/unit-screenshot-command";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ApplicationPaths } from "../../environment/paths.js";
import { createDoctor, type Doctor, type DoctorCollectionScope } from "./model.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export interface CreateLocalDoctorOptions {
  readonly browserSetup: UniverRenderBrowserSetupCommandDependencies;
  readonly config: Config;
  readonly control: DaemonControl;
  readonly cwd?: string;
  readonly paths: ApplicationPaths;
  readonly version: string;
}

/** Bind Local config, daemon, browser, paths, and diagnostic files to the application doctor. */
export function createLocalDoctor(options: CreateLocalDoctorOptions): Doctor {
  const cwd = options.cwd ?? process.cwd();
  return createDoctor({
    checks: [
      {
        name: "config",
        async run() {
          const entries = await options.config.list();
          return {
            details: {
              path: options.config.path,
              registeredKeys: entries.map((entry) => entry.key),
            },
            message: `${String(entries.length)} registered keys`,
            ok: true,
          };
        },
      },
      {
        name: "daemon",
        async run() {
          const status = await options.control.status();
          return {
            details: redactedRecord(status),
            message: status.state,
            ok: status.state === "running" || status.state === "stopped",
          };
        },
      },
      {
        name: "screenshot-browser",
        async run() {
          const resolution = await options.browserSetup.resolve();
          if (resolution.status === "found") {
            return {
              details: {
                available: true,
                executablePath: resolution.executablePath,
                source: resolution.source,
              },
              message: resolution.source,
              ok: true,
            };
          }
          return {
            details: {
              available: false,
              cacheDir: resolution.cacheDir,
              checkedPaths: resolution.checkedPaths,
              envVar: resolution.envVar,
            },
            message: "missing; run `univer screenshot setup`",
            // Missing an optional browser does not block non-rendering Local tasks.
            ok: true,
          };
        },
      },
    ],
    collector: {
      async collect(scope) {
        return await collectLocalDiagnostics({ cwd, options, scope });
      },
    },
  });
}

async function collectLocalDiagnostics(input: {
  readonly cwd: string;
  readonly options: CreateLocalDoctorOptions;
  readonly scope: DoctorCollectionScope;
}): Promise<{
  readonly files: readonly string[];
  readonly outputPath: string;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
}> {
  const outputPath =
    input.scope.output === undefined
      ? resolve(
          input.options.paths.homeDir,
          "diagnostics",
          `collect-${input.scope.createdAt.replace(/[:.]/gu, "-")}`,
        )
      : resolve(input.cwd, input.scope.output);
  await mkdir(outputPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await chmod(outputPath, PRIVATE_DIRECTORY_MODE);

  const [daemon, browser] = await Promise.all([
    captureDiagnostic(async () => await input.options.control.status()),
    captureDiagnostic(async () => await input.options.browserSetup.resolve()),
  ]);
  const environmentPath = resolve(outputPath, "environment.json");
  const statusPath = resolve(outputPath, "status.json");
  const summaryPath = resolve(outputPath, "summary.json");
  const manifestPath = resolve(outputPath, "manifest.json");
  const warnings = [
    "Structured CLI, daemon, and runtime event logs are not available in this build.",
  ];
  const environment = {
    application: { name: "univer-cli", version: input.options.version },
    runtime: { arch: process.arch, node: process.version, platform: process.platform },
    paths: {
      config: input.options.paths.configPath,
      daemon: input.options.paths.daemonDir,
      home: input.options.paths.homeDir,
      socket: input.options.paths.socketPath,
    },
  };
  const status = redactedRecord({ browser, daemon });
  const summary = {
    createdAt: input.scope.createdAt,
    scope: redactedRecord(input.scope),
    warnings,
  };
  await writePrivateJson(environmentPath, environment);
  await writePrivateJson(statusPath, status);
  await writePrivateJson(summaryPath, summary);

  const files = [environmentPath, statusPath, summaryPath, manifestPath];
  await writePrivateJson(manifestPath, {
    createdAt: input.scope.createdAt,
    files,
    schemaVersion: 1,
    tool: "univer doctor collect",
  });
  return { files, outputPath, summary, warnings };
}

async function captureDiagnostic(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    return {
      error: {
        code: errorCode(error),
        message: error instanceof Error ? error.message : String(error),
      },
      ok: false,
    };
  }
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(redactDiagnosticValue(value), null, 2)}\n`, {
    mode: PRIVATE_FILE_MODE,
  });
  await chmod(path, PRIVATE_FILE_MODE);
}

function redactedRecord(value: object): Readonly<Record<string, unknown>> {
  return redactDiagnosticValue(value) as Readonly<Record<string, unknown>>;
}

function redactDiagnosticValue(value: unknown, key = ""): unknown {
  if (isSensitiveKey(key)) return "<redacted>";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticValue(item));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      redactDiagnosticValue(child, childKey),
    ]),
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/gu, "").toLowerCase();
  return /(?:auth|cookie|credential|license|password|privatekey|secret|token)/u.test(normalized);
}

function redactString(value: string): string {
  const withoutBearer = value.replace(/\bBearer\s+[^\s,;]+/giu, "Bearer <redacted>");
  return withoutBearer.replace(/https?:\/\/[^\s"'<>]+/giu, (source) => {
    try {
      const url = new URL(source);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return "<redacted-url>";
    }
  });
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : "DIAGNOSTIC_CHECK_FAILED";
}
