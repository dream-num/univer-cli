import type { DaemonControl, DaemonStatus } from "@univer-cli/daemon";
import type { GatewayInfoResult } from "./protocol.js";

export type ApplicationGatewayStatus =
  | ({ readonly state: "running" } & GatewayInfoResult)
  | { readonly state: "stopped" }
  | {
      readonly diagnostic: { readonly code?: string; readonly message: string };
      readonly state: "unreachable";
    }
  | {
      readonly reason: "daemon-incompatible" | "daemon-unreachable";
      readonly state: "unknown";
    };

export interface ApplicationDaemonStatus {
  readonly daemon: DaemonStatus;
  readonly gateway: ApplicationGatewayStatus;
}

export type GatewayInfoReader = () => Promise<GatewayInfoResult>;

/** Combine target-neutral daemon health with the Local application's Gateway component. */
export async function readApplicationDaemonStatus(
  control: DaemonControl,
  readGatewayInfo: GatewayInfoReader,
): Promise<ApplicationDaemonStatus> {
  const daemon = await control.status();
  if (daemon.state === "stopped") return { daemon, gateway: { state: "stopped" } };
  if (daemon.state === "unreachable") {
    return { daemon, gateway: { reason: "daemon-unreachable", state: "unknown" } };
  }
  if (daemon.state === "incompatible") {
    return { daemon, gateway: { reason: "daemon-incompatible", state: "unknown" } };
  }
  try {
    return { daemon, gateway: { ...(await readGatewayInfo()), state: "running" } };
  } catch (error) {
    return { daemon, gateway: { diagnostic: diagnostic(error), state: "unreachable" } };
  }
}

function diagnostic(error: unknown): { readonly code?: string; readonly message: string } {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.length > 0
      ? error.code
      : undefined;
  return {
    ...(code === undefined ? {} : { code }),
    message: error instanceof Error && error.message.length > 0 ? error.message : "Gateway failed",
  };
}
