import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { StartedServer } from "@univer/collab-gateway";
import type { UniverfileUpgradeResult } from "@univer/univerfile-sqlite";
import { GATEWAY_INFO_METHOD } from "../../daemon/protocol.js";
import {
  parsePathRequest,
  parseStatusRequest,
  UNIVERFILE_CREATE_METHOD,
  UNIVERFILE_OPEN_METHOD,
  UNIVERFILE_STATUS_METHOD,
} from "./protocol.js";

export function registerUniverfileHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
  readonly info: JsonValue;
}): void {
  const reportedUpgrades = new Set<string>();

  input.daemon.handle(GATEWAY_INFO_METHOD, async () => input.info);
  input.daemon.handle(UNIVERFILE_CREATE_METHOD, async (payload) => {
    const request = parsePathRequest(payload);
    const univerfile = input.gateway.manager.createUniverfile(request.path);
    return openResult(
      univerfile.path,
      readUpgrade(univerfile.path, univerfile.collab.runtime.upgrade),
    );
  });
  input.daemon.handle(UNIVERFILE_OPEN_METHOD, async (payload) => {
    const request = parsePathRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    return openResult(
      univerfile.path,
      readUpgrade(univerfile.path, univerfile.collab.runtime.upgrade),
    );
  });
  input.daemon.handle(UNIVERFILE_STATUS_METHOD, async (payload) => {
    const request = parseStatusRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    const allUnits =
      request.worktreeId === undefined
        ? univerfile.collab.listUnits()
        : univerfile.collab.worktreeUnits(request.worktreeId);
    const units =
      request.unitId === undefined
        ? allUnits
        : allUnits.filter((unit) => unit.unitId === request.unitId);
    const summary =
      request.worktreeId === undefined
        ? undefined
        : univerfile.collab
            .listWorktrees()
            .find((worktree) => worktree.worktreeId === request.worktreeId);
    if (request.worktreeId !== undefined && summary === undefined) {
      throw codedError(
        "UNIVERFILE_WORKTREE_NOT_FOUND",
        `Worktree ${request.worktreeId} not found in ${univerfile.path}`,
      );
    }
    return {
      filePath: univerfile.path,
      scope: request.worktreeId === undefined ? "trunk" : "worktree",
      units: units.map((unit) => ({
        headRev: unit.headRev,
        name: unit.name,
        type: unit.type,
        unitId: unit.unitId,
      })),
      upgrade: readUpgrade(univerfile.path, univerfile.collab.runtime.upgrade),
      ...(summary === undefined
        ? {}
        : {
            worktree: {
              baseline: summary.baseline,
              name: summary.name,
              status: summary.status,
              worktreeId: summary.worktreeId,
            },
          }),
    } as unknown as JsonValue;
  });

  function readUpgrade(path: string, upgrade: UniverfileUpgradeResult): UniverfileUpgradeResult {
    if (upgrade.status !== "upgraded" || reportedUpgrades.has(path)) {
      return { status: "unchanged", format: "v2" };
    }
    reportedUpgrades.add(path);
    return upgrade;
  }
}

function openResult(path: string, upgrade: unknown): JsonValue {
  return { filePath: path, upgrade } as JsonValue;
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
