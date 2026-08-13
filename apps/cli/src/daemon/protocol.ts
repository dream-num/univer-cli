import type { JsonValue } from "@univer-cli/daemon";
import { codedError, requireRecord, requireString } from "./rpc-values.js";

export const GATEWAY_INFO_METHOD = "univer.gateway.info";

export interface GatewayInfoResult {
  readonly origin: string;
  readonly port: number;
  readonly viewUrl: string;
}

export function parseGatewayInfo(value: JsonValue): GatewayInfoResult {
  const record = requireRecord(value, "gateway info");
  const origin = requireString(record["origin"], "gateway info origin");
  const viewUrl = requireString(record["viewUrl"], "gateway info viewUrl");
  const port = record["port"];
  if (typeof port !== "number" || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw codedError("DAEMON_RESULT_INVALID", "gateway info port is invalid");
  }
  return { origin, port, viewUrl };
}
