import type { JsonValue } from "@univer-cli/daemon";
import type { OptimizeUniverfileReport } from "@univer/collab-gateway-contract";
import {
  codedError,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";

export const UNIVERFILE_OPTIMIZE_METHOD = "univer.univerfile.optimize";

export interface UniverfileOptimizeRequest {
  readonly dryRun: boolean;
  readonly history?: "reset";
  readonly images?: "externalize";
  readonly outputPath?: string;
  readonly path: string;
  readonly worktrees?: "clean";
}

export function parseUniverfileOptimizeRequest(payload: JsonValue): UniverfileOptimizeRequest {
  const record = requireRecord(payload, "Univerfile optimize request");
  if (typeof record["dryRun"] !== "boolean") {
    throw codedError("OPTIMIZE_REQUEST_INVALID", "optimize dryRun must be a boolean");
  }
  const outputPath = optionalString(record["outputPath"], "optimize output path");
  const images = optionalLiteral(record["images"], "externalize", "optimize images");
  const worktrees = optionalLiteral(record["worktrees"], "clean", "optimize worktrees");
  const history = optionalLiteral(record["history"], "reset", "optimize history");
  if (!record["dryRun"] && outputPath === undefined) {
    throw codedError(
      "OPTIMIZE_OUTPUT_REQUIRED",
      "--out <file.univer> is required without --dry-run",
    );
  }
  return {
    dryRun: record["dryRun"],
    path: requireString(record["path"], "optimize source path"),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(images === undefined ? {} : { images }),
    ...(worktrees === undefined ? {} : { worktrees }),
    ...(history === undefined ? {} : { history }),
  };
}

export function parseOptimizeResult(value: JsonValue): OptimizeUniverfileReport {
  const record = requireRecord(value, "optimize result");
  requireString(record["sourcePath"], "optimize source path");
  if (typeof record["dryRun"] !== "boolean") {
    throw codedError("DAEMON_RESULT_INVALID", "optimize result dryRun is invalid");
  }
  return record as unknown as OptimizeUniverfileReport;
}

function optionalLiteral<Value extends string>(
  value: JsonValue | undefined,
  expected: Value,
  label: string,
): Value | undefined {
  if (value === undefined) return undefined;
  if (value !== expected) throw codedError("OPTIMIZE_REQUEST_INVALID", `${label} is invalid`);
  return expected;
}
