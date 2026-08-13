import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import {
  DAEMON_PROTOCOL_VERSION,
  type DaemonControl,
  type DaemonHealth,
  type DaemonIdentity,
  type DaemonRestartResult,
  type DaemonStartResult,
  type DaemonStatus,
  type DaemonStopResult,
  type JsonValue,
} from "@univer-cli/daemon";
import { clearDaemonStartupDiagnostic, readDaemonStartupDiagnostic } from "./startup-diagnostic.js";

const LEGACY_HEALTH_METHOD = "daemon.health";
const LEGACY_SHUTDOWN_METHOD = "daemon.shutdown";
const LEGACY_DISTRIBUTION_ID = "univer-cli";
const LEGACY_REQUEST_TIMEOUT_MS = 2_000;
const LEGACY_STOP_TIMEOUT_MS = 10_000;

interface LegacyDaemonHealth {
  readonly buildId?: string;
  readonly distributionId: string;
  readonly pid: number;
  readonly socketPath: string;
  readonly startedAt: string;
}

export interface LegacyDaemonControl {
  health(): Promise<LegacyDaemonHealth>;
  shutdown(): Promise<void>;
}

export function createDaemonControlWithLegacyTakeover(input: {
  readonly control: DaemonControl;
  readonly identity: DaemonIdentity;
  readonly legacy?: LegacyDaemonControl;
  readonly socketPath: string;
}): DaemonControl {
  const legacy = input.legacy ?? createLegacyDaemonControl(input.socketPath);

  const status = async (): Promise<DaemonStatus> => {
    const current = await input.control.status();
    if (current.state !== "unreachable" && current.state !== "incompatible") return current;
    try {
      return legacyStatus(await legacy.health(), input.identity, input.socketPath);
    } catch {
      return current;
    }
  };

  const stopLegacy = async (health: DaemonHealth): Promise<void> => {
    if (health.identity.id !== LEGACY_DISTRIBUTION_ID) {
      throw codedError(
        "DAEMON_IDENTITY_MISMATCH",
        `Refusing to stop daemon owned by ${health.identity.id}`,
      );
    }
    await legacy.shutdown();
    const startedAt = Date.now();
    while (Date.now() - startedAt < LEGACY_STOP_TIMEOUT_MS) {
      const current = await input.control.status();
      if (current.state === "stopped") return;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw codedError("DAEMON_STOP_TIMEOUT", "Legacy daemon did not stop before timeout");
  };

  const withStartupDiagnostic = async <T>(operation: () => Promise<T>): Promise<T> => {
    await clearDaemonStartupDiagnostic(input.socketPath);
    try {
      return await operation();
    } catch (error) {
      if (!hasCode(error, "DAEMON_START_TIMEOUT")) throw error;
      throw (await readDaemonStartupDiagnostic(input.socketPath)) ?? error;
    }
  };

  const start = async (): Promise<DaemonStartResult> => {
    const current = await status();
    if (current.state === "running") return { ...current, started: false };
    if (isOwnedLegacy(current)) await stopLegacy(current.actual);
    return await withStartupDiagnostic(async () => await input.control.start());
  };

  return {
    async restart(): Promise<DaemonRestartResult> {
      const current = await status();
      if (!isOwnedLegacy(current)) {
        return await withStartupDiagnostic(async () => await input.control.restart());
      }
      const previousPid = current.actual.pid;
      await stopLegacy(current.actual);
      const running = await withStartupDiagnostic(async () => await input.control.start());
      return { ...running, previousPid, restarted: true };
    },
    start,
    status,
    async stop(): Promise<DaemonStopResult> {
      const current = await status();
      if (!isOwnedLegacy(current)) return await input.control.stop();
      await stopLegacy(current.actual);
      return { socketPath: input.socketPath, state: "stopped", stopped: true };
    },
  };
}

function isOwnedLegacy(status: DaemonStatus): status is Extract<
  DaemonStatus,
  { state: "incompatible" }
> & {
  readonly actual: DaemonHealth;
} {
  return (
    status.state === "incompatible" &&
    status.reason === "legacy-protocol" &&
    status.actual?.identity.id === LEGACY_DISTRIBUTION_ID
  );
}

function legacyStatus(
  legacy: LegacyDaemonHealth,
  expectedIdentity: DaemonIdentity,
  socketPath: string,
): DaemonStatus {
  const actual: DaemonHealth = {
    identity: {
      ...(legacy.buildId === undefined ? {} : { buildId: legacy.buildId }),
      id: legacy.distributionId,
      version: "legacy",
    },
    pid: legacy.pid,
    protocolVersion: 0,
    socketPath,
    startedAt: legacy.startedAt,
  };
  return {
    actual,
    expected: { identity: expectedIdentity, protocolVersion: DAEMON_PROTOCOL_VERSION },
    reason:
      legacy.distributionId === LEGACY_DISTRIBUTION_ID ? "legacy-protocol" : "identity-mismatch",
    socketPath,
    state: "incompatible",
  };
}

function createLegacyDaemonControl(socketPath: string): LegacyDaemonControl {
  return {
    async health(): Promise<LegacyDaemonHealth> {
      return parseLegacyHealth(
        await sendLegacyDaemonRequest(socketPath, LEGACY_HEALTH_METHOD, undefined),
        socketPath,
      );
    },
    async shutdown(): Promise<void> {
      await sendLegacyDaemonRequest(socketPath, LEGACY_SHUTDOWN_METHOD, undefined);
    },
  };
}

function sendLegacyDaemonRequest(
  socketPath: string,
  method: string,
  params: JsonValue | undefined,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const socket = connect(socketPath);
    const id = randomUUID();
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      socket.destroy();
      settle(() => reject(codedError("DAEMON_REQUEST_TIMEOUT", "Legacy daemon request timed out")));
    }, LEGACY_REQUEST_TIMEOUT_MS);
    const settle = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      operation();
    };
    socket.once("error", (error) => settle(() => reject(error)));
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const response: unknown = JSON.parse(buffer.slice(0, newline));
        if (!isRecord(response) || response["id"] !== id) {
          throw new Error("Legacy daemon returned an invalid response");
        }
        if (response["error"] !== undefined) {
          const error = isRecord(response["error"]) ? response["error"] : {};
          throw codedError(
            typeof error["code"] === "string" ? error["code"] : "DAEMON_LEGACY_ERROR",
            typeof error["message"] === "string" ? error["message"] : "Legacy daemon failed",
          );
        }
        settle(() => {
          socket.end();
          resolve(response["result"]);
        });
      } catch (error) {
        settle(() => {
          socket.destroy();
          reject(error);
        });
      }
    });
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`,
      );
    });
  });
}

function parseLegacyHealth(value: unknown, socketPath: string): LegacyDaemonHealth {
  if (!isRecord(value)) throw new Error("Legacy daemon health is invalid");
  const distributionId = value["distributionId"];
  const pid = value["pid"];
  const actualSocketPath = value["socketPath"];
  const startedAt = value["startedAt"];
  const buildId = value["buildId"];
  if (
    typeof distributionId !== "string" ||
    typeof pid !== "number" ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    actualSocketPath !== socketPath ||
    typeof startedAt !== "string" ||
    Number.isNaN(Date.parse(startedAt)) ||
    (buildId !== undefined && typeof buildId !== "string")
  ) {
    throw new Error("Legacy daemon health is invalid");
  }
  return {
    ...(buildId === undefined ? {} : { buildId }),
    distributionId,
    pid,
    socketPath,
    startedAt,
  };
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function hasCode(value: unknown, code: string): boolean {
  return isRecord(value) && value["code"] === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
