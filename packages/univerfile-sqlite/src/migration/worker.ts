import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { UniverfileSQLiteError } from "../errors.js";

export const SQLITE_WORKER_ENV = "UNIVERFILE_UPGRADE_WORKER";
export const SQLITE_WORKER_PATH_ENV = "UNIVERFILE_UPGRADE_PATH";
export const SQLITE_WORKER_RESULT_ENV = "UNIVERFILE_UPGRADE_RESULT";
export const SQLITE_WORKER_OPERATION_ENV = "UNIVERFILE_SQLITE_WORKER_OPERATION";
export const SQLITE_WORKER_CANDIDATE_ENV = "UNIVERFILE_UPGRADE_CANDIDATE";

/** Native libsql statement handles are released deterministically when this child exits. */
export function runUniverfileSQLiteWorker<T>(filename: string, operation: "detect" | "upgrade"): T {
  const resultPath = join(tmpdir(), `univerfile-${operation}-${randomUUID()}.json`);
  const candidatePath =
    operation === "upgrade"
      ? join(dirname(filename), `.${basename(filename)}.upgrade-${randomUUID()}.univer`)
      : undefined;
  const script = workerScriptPath(operation);
  let succeeded = false;
  try {
    const child = spawnSync(process.execPath, workerLaunchArgs(script), {
      env: {
        ...process.env,
        [SQLITE_WORKER_ENV]: "1",
        UNIVERFILE_UPGRADE_IN_PROCESS: "1",
        [SQLITE_WORKER_PATH_ENV]: filename,
        [SQLITE_WORKER_RESULT_ENV]: resultPath,
        [SQLITE_WORKER_OPERATION_ENV]: operation,
        ...(candidatePath === undefined ? {} : { [SQLITE_WORKER_CANDIDATE_ENV]: candidatePath }),
      },
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000,
    });
    if (!existsSync(resultPath)) {
      const detail = `${child.stderr ?? ""}${child.stdout ?? ""}`.trim();
      throw new UniverfileSQLiteError(
        operation === "detect" ? "UNSUPPORTED_SCHEMA" : "UPGRADE_FAILED",
        detail ||
          `SQLite ${operation} helper exited (${String(child.status ?? child.signal ?? "unknown")})`,
      );
    }
    const payload = JSON.parse(readFileSync(resultPath, "utf8")) as
      | { readonly ok: true; readonly outcome: T }
      | {
          readonly ok: false;
          readonly code: ConstructorParameters<typeof UniverfileSQLiteError>[0];
          readonly message: string;
        };
    if (!payload.ok) throw new UniverfileSQLiteError(payload.code, payload.message);
    if (child.status !== 0) {
      throw new UniverfileSQLiteError(
        operation === "detect" ? "UNSUPPORTED_SCHEMA" : "UPGRADE_FAILED",
        `SQLite ${operation} helper did not exit successfully (${String(child.status ?? child.signal)})`,
      );
    }
    succeeded = true;
    return payload.outcome;
  } finally {
    if (existsSync(resultPath)) unlinkSync(resultPath);
    if (!succeeded && candidatePath !== undefined && existsSync(candidatePath))
      unlinkSync(candidatePath);
  }
}

/** Reuse the CLI's upgrade-worker entry; source development uses the package's tsx loader. */
function workerScriptPath(operation: "detect" | "upgrade"): string {
  const self = fileURLToPath(import.meta.url);
  for (const candidate of [
    join(dirname(self), "upgrade-worker.js"),
    join(dirname(self), "..", "upgrade-worker.js"),
    operation === "detect"
      ? join(dirname(self), "..", "schema", "detect-worker.ts")
      : join(dirname(self), "upgrade.ts"),
  ]) {
    if (existsSync(candidate)) return realpathSync(candidate);
  }
  if (!self.endsWith(".ts")) return realpathSync(self);
  throw new UniverfileSQLiteError("UPGRADE_FAILED", "SQLite helper entry is unavailable");
}

/** Complete an owned worker operation, then exit before the parent touches its files. */
export function completeUniverfileSQLiteWorker(operation: (filename: string) => unknown): void {
  const filename = process.env[SQLITE_WORKER_PATH_ENV];
  const resultPath = process.env[SQLITE_WORKER_RESULT_ENV];
  if (!filename || !resultPath) {
    process.stderr.write("SQLite helper is missing its path or result file\n");
    process.exit(1);
  }
  try {
    writeFileSync(resultPath, JSON.stringify({ ok: true, outcome: operation(filename) }));
    process.exit(0);
  } catch (error) {
    writeFileSync(
      resultPath,
      JSON.stringify({
        ok: false,
        code: error instanceof UniverfileSQLiteError ? error.code : "UPGRADE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

function workerLaunchArgs(script: string): string[] {
  if (!script.endsWith(".ts")) return [script];
  const require = createRequire(import.meta.url);
  const loader = pathToFileURL(require.resolve("tsx")).href;
  return ["--import", loader, script];
}
