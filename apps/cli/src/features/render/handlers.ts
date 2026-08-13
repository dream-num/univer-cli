import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { CollabService, StartedServer } from "@univer/collab-gateway";
import { UniverInstanceType } from "@univerjs/core";
import {
  codedError,
  pullCurrent,
  requireWorktree,
  type UnitSummary,
} from "../../daemon/collaboration-access.js";
import type { LocalCollaborationRuntimePool } from "../../daemon/collaboration-runtime-pool.js";
import { CONTENT_RENDER_SOURCE_METHOD, parseContentRenderSourceRequest } from "./protocol.js";
import { unitKindFromType } from "../unit/protocol.js";
import {
  embeddedUnitIds,
  externalReferenceUnitIds,
  resolveLocalImageAssetsForRender,
} from "./unit-data.js";

export function registerRenderHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
  readonly runtimes: LocalCollaborationRuntimePool;
}): void {
  input.daemon.handle(CONTENT_RENDER_SOURCE_METHOD, async (payload) => {
    const request = parseContentRenderSourceRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    if (request.worktreeId !== undefined) {
      requireWorktree(univerfile.collab, request.worktreeId);
    }
    const units =
      request.worktreeId === undefined
        ? univerfile.collab.listUnits()
        : univerfile.collab.worktreeUnits(request.worktreeId);
    const unit = selectRenderUnit(units, request.unitId);
    const unitData = await loadRenderUnitData({
      collab: univerfile.collab,
      filePath: univerfile.path,
      runtimes: input.runtimes,
      unit,
      ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
    });

    const formulaReferenceUnits: Array<{
      readonly unitType: "sheet" | "base";
      readonly unitData: Record<string, unknown>;
    }> = [];
    const formulaIds = new Set<string>();
    for (const unitId of externalReferenceUnitIds(unitData)) {
      if (unitId === unit.unitId) continue;
      const dependency = requireRenderDependency(units, unitId, "formula reference");
      const kind = unitKindFromType(dependency.type);
      if (kind !== "sheet" && kind !== "base") {
        throw codedError(
          "SCREENSHOT_REFERENCE_UNIT_TYPE_UNSUPPORTED",
          `Formula reference Unit ${unitId} is ${kind}; expected sheet or base`,
        );
      }
      formulaReferenceUnits.push({
        unitType: kind,
        unitData: await loadRenderUnitData({
          collab: univerfile.collab,
          filePath: univerfile.path,
          runtimes: input.runtimes,
          unit: dependency,
          ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
        }),
      });
      formulaIds.add(unitId);
    }

    const embeddedUnits: Array<{
      readonly unitType: "sheet" | "doc" | "slide" | "board" | "base";
      readonly unitData: Record<string, unknown>;
    }> = [];
    for (const unitId of embeddedUnitIds(unitData)) {
      if (unitId === unit.unitId || formulaIds.has(unitId)) continue;
      const dependency = requireRenderDependency(units, unitId, "embedded");
      embeddedUnits.push({
        unitType: unitKindFromType(dependency.type),
        unitData: await loadRenderUnitData({
          collab: univerfile.collab,
          filePath: univerfile.path,
          runtimes: input.runtimes,
          unit: dependency,
          ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
        }),
      });
    }

    return {
      unitType: unitKindFromType(unit.type),
      unitData,
      ...(formulaReferenceUnits.length === 0 ? {} : { formulaReferenceUnits }),
      ...(embeddedUnits.length === 0 ? {} : { embeddedUnits }),
    } as unknown as JsonValue;
  });
}

function selectRenderUnit(units: readonly UnitSummary[], unitId: string | undefined): UnitSummary {
  if (unitId !== undefined) return requireRenderDependency(units, unitId, "target");
  if (units.length !== 1) {
    throw codedError(
      "SCREENSHOT_UNIT_REQUIRED",
      "Specify --unit <id>: the selected scope has zero or multiple Units",
    );
  }
  return units[0]!;
}

function requireRenderDependency(
  units: readonly UnitSummary[],
  unitId: string,
  role: string,
): UnitSummary {
  const unit = units.find((candidate) => candidate.unitId === unitId);
  if (unit === undefined) {
    throw codedError("SCREENSHOT_UNIT_NOT_FOUND", `${role} Unit ${unitId} not found`);
  }
  return unit;
}

async function loadRenderUnitData(input: {
  readonly collab: CollabService;
  readonly filePath: string;
  readonly runtimes: LocalCollaborationRuntimePool;
  readonly unit: UnitSummary;
  readonly worktreeId?: string;
}): Promise<Record<string, unknown>> {
  const lease = await input.runtimes.acquire({
    filePath: input.filePath,
    unitId: input.unit.unitId,
    unitType: input.unit.type as UniverInstanceType,
    ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
  });
  let reusable = false;
  try {
    await pullCurrent(lease);
    const unitData = await lease.exportUnitData();
    reusable = true;
    return resolveLocalImageAssetsForRender({
      collab: input.collab,
      unitData: unitData as unknown as Record<string, unknown>,
      ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
    });
  } finally {
    if (reusable) await lease.release();
    else await lease.invalidate();
  }
}
