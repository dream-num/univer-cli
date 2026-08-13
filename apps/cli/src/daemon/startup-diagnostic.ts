import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STARTUP_DIAGNOSTIC_FILE = "startup-error.json";

interface StartupDiagnostic {
  readonly code?: string;
  readonly message: string;
}

export async function clearDaemonStartupDiagnostic(socketPath: string): Promise<void> {
  await unlink(diagnosticPath(socketPath)).catch((error: unknown) => {
    if (!hasCode(error, "ENOENT")) throw error;
  });
}

export async function readDaemonStartupDiagnostic(socketPath: string): Promise<Error | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(diagnosticPath(socketPath), "utf8"));
    if (!isRecord(value) || typeof value["message"] !== "string") return undefined;
    const error = new Error(value["message"]);
    if (typeof value["code"] === "string") Object.assign(error, { code: value["code"] });
    return error;
  } catch (error) {
    if (hasCode(error, "ENOENT") || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export async function writeDaemonStartupDiagnostic(
  socketPath: string,
  error: unknown,
): Promise<void> {
  const diagnostic = serializeError(error);
  const path = diagnosticPath(socketPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(diagnostic)}\n`, { mode: 0o600 });
}

function diagnosticPath(socketPath: string): string {
  return join(dirname(socketPath), STARTUP_DIAGNOSTIC_FILE);
}

function serializeError(error: unknown): StartupDiagnostic {
  if (!(error instanceof Error)) return { message: String(error) };
  const code = isRecord(error) && typeof error["code"] === "string" ? error["code"] : undefined;
  return { ...(code === undefined ? {} : { code }), message: error.message };
}

function hasCode(value: unknown, code: string): boolean {
  return isRecord(value) && value["code"] === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
