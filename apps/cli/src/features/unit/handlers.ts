import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { StartedServer } from "@univer/collab-gateway";
import {
  requireDraftWorktree,
  requireUnit,
  requireWorktree,
} from "../../daemon/collaboration-access.js";
import {
  parseUnitCreateRequest,
  parseUnitPathRequest,
  parseUnitTargetRequest,
  UNIT_CREATE_METHOD,
  UNIT_LIST_METHOD,
  UNIT_REMOVE_METHOD,
  unitKindFromType,
  unitTypeFromKind,
} from "./protocol.js";

export function registerUnitHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
}): void {
  input.daemon.handle(UNIT_CREATE_METHOD, async (payload) => {
    const request = parseUnitCreateRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireDraftWorktree(univerfile.collab, request.worktreeId);
    const created = await univerfile.collab.createWorktreeUnit(
      request.worktreeId,
      unitTypeFromKind(request.kind),
      request.name,
    );
    const unit = requireUnit(univerfile.collab, request.worktreeId, created.unitId);
    return {
      filePath: univerfile.path,
      headRev: unit.headRev,
      kind: request.kind,
      name: unit.name,
      type: unit.type,
      unitId: unit.unitId,
      worktreeId: request.worktreeId,
    } as JsonValue;
  });
  input.daemon.handle(UNIT_REMOVE_METHOD, async (payload) => {
    const request = parseUnitTargetRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireDraftWorktree(univerfile.collab, request.worktreeId);
    requireUnit(univerfile.collab, request.worktreeId, request.unitId);
    univerfile.collab.deleteWorktreeUnit(request.worktreeId, request.unitId);
    return {
      filePath: univerfile.path,
      removed: true,
      unitId: request.unitId,
      worktreeId: request.worktreeId,
    } as JsonValue;
  });
  input.daemon.handle(UNIT_LIST_METHOD, async (payload) => {
    const request = parseUnitPathRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    if (request.worktreeId !== undefined) {
      requireWorktree(univerfile.collab, request.worktreeId);
    }
    const units =
      request.worktreeId === undefined
        ? univerfile.collab.listUnits()
        : univerfile.collab.worktreeUnits(request.worktreeId);
    return {
      filePath: univerfile.path,
      scope: request.worktreeId === undefined ? "trunk" : "worktree",
      units: units.map((unit) => ({
        headRev: unit.headRev,
        kind: unitKindFromType(unit.type),
        name: unit.name,
        type: unit.type,
        unitId: unit.unitId,
      })),
      ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
    } as JsonValue;
  });
}
