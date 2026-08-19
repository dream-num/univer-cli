import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { CollaborationUnitData } from "@univer-cli/univer-collaboration-runtime";
import type { StartedServer } from "@univer/collab-gateway";
import { ExchangeFormat } from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import { extname } from "node:path";
import {
  codedError,
  pullCurrent,
  requireDraftWorktree,
  requireWorktree,
  type LocalCollaboration,
  type UnitSummary,
} from "../../daemon/collaboration-access.js";
import type { LocalCollaborationRuntimePool } from "../../daemon/collaboration-runtime-pool.js";
import { unitKindFromType, unitTypeFromKind } from "../unit/protocol.js";
import { exportOfficeFile, importOfficeFile, type ExchangeUnitType } from "./exchange-node.js";
import {
  CONTENT_EXPORT_METHOD,
  CONTENT_IMPORT_METHOD,
  parseContentExportRequest,
  parseContentImportRequest,
  type ContentExportRequest,
  type ExchangeUnitKind,
} from "./protocol.js";

export function registerExchangeHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
  readonly runtimes: LocalCollaborationRuntimePool;
}): void {
  input.daemon.handle(CONTENT_IMPORT_METHOD, async (payload) => {
    const request = parseContentImportRequest(payload);
    const unitType = unitTypeFromKind(request.kind) as ExchangeUnitType;
    if (request.worktreeId === undefined) {
      input.gateway.manager.prepareNewUniverfilePath(request.path);
    }
    const imported = await importOfficeFile({
      sourcePath: request.sourcePath,
      unitType,
      ...(request.formulaCalculationMode === undefined
        ? {}
        : { formulaCalculationMode: request.formulaCalculationMode }),
    });
    const univerfile =
      request.worktreeId === undefined
        ? input.gateway.manager.createUniverfile(request.path)
        : input.gateway.manager.openByPath(request.path);
    const created =
      request.worktreeId === undefined
        ? await univerfile.collab.createUnit(unitType, {
            data: imported,
            name: request.name,
          })
        : await createImportedWorktreeUnit(
            univerfile.collab,
            request.worktreeId,
            unitType,
            request.name,
            imported,
          );
    return {
      filePath: univerfile.path,
      kind: request.kind,
      name: request.name,
      scope: request.worktreeId === undefined ? "trunk" : "worktree",
      sourcePath: request.sourcePath,
      type: unitType,
      unitId: created.unitId,
      ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
    } as JsonValue;
  });
  input.daemon.handle(CONTENT_EXPORT_METHOD, async (payload) => {
    const request = parseContentExportRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    if (request.worktreeId !== undefined) {
      requireWorktree(univerfile.collab, request.worktreeId);
    }
    const units =
      request.worktreeId === undefined
        ? univerfile.collab.listUnits()
        : univerfile.collab.worktreeUnits(request.worktreeId);
    const unit = selectExportUnit(units, request.unitId);
    const kind = exportKind(unit.type);
    const lease = await input.runtimes.acquire({
      filePath: univerfile.path,
      unitId: unit.unitId,
      unitType: unit.type as UniverInstanceType,
      ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
    });
    let reusable = false;
    try {
      await pullCurrent(lease);
      const unitData = await lease.exportUnitData();
      await exportUnit(unit.type, unitData, request);
      reusable = true;
      return {
        filePath: univerfile.path,
        kind,
        outputPath: request.outputPath,
        scope: request.worktreeId === undefined ? "trunk" : "worktree",
        type: unit.type,
        unitId: unit.unitId,
        ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
      } as JsonValue;
    } finally {
      if (reusable) await lease.release();
      else await lease.invalidate();
    }
  });
}

async function createImportedWorktreeUnit(
  collab: LocalCollaboration,
  worktreeId: string,
  unitType: ExchangeUnitType,
  name: string,
  data: object,
): Promise<{ readonly unitId: string }> {
  requireDraftWorktree(collab, worktreeId);
  return await collab.createWorktreeUnit(worktreeId, unitType, name, undefined, data);
}

function selectExportUnit(units: readonly UnitSummary[], unitId: string | undefined): UnitSummary {
  if (unitId !== undefined) {
    const unit = units.find((candidate) => candidate.unitId === unitId);
    if (unit === undefined) throw codedError("EXPORT_UNIT_NOT_FOUND", `Unit ${unitId} not found`);
    return unit;
  }
  if (units.length !== 1) {
    throw codedError(
      "EXPORT_UNIT_REQUIRED",
      "Specify --unit <id>: the selected scope has zero or multiple Units",
    );
  }
  return units[0]!;
}

function exportKind(type: number): ExchangeUnitKind {
  const kind = unitKindFromType(type);
  if (kind === "board") {
    throw codedError("EXPORT_UNIT_TYPE_UNSUPPORTED", "Board Units cannot be exported by this SDK");
  }
  return kind;
}

async function exportUnit(
  type: number,
  unitData: CollaborationUnitData,
  request: ContentExportRequest,
): Promise<void> {
  const extension = extname(request.outputPath).toLowerCase();
  const options = {
    ...(request.formulaCalculationMode === undefined
      ? {}
      : { formulaCalculationMode: request.formulaCalculationMode }),
    ...(request.sheetName === undefined ? {} : { sheetName: request.sheetName }),
    ...(request.tableName === undefined ? {} : { tableName: request.tableName }),
  };
  switch (type) {
    case UniverInstanceType.UNIVER_SHEET:
      await exportOfficeFile({
        ...options,
        format: requireSheetLikeExportFormat(extension, "Sheet"),
        outputPath: request.outputPath,
        data: unitData,
        unitType: UniverInstanceType.UNIVER_SHEET,
      });
      return;
    case UniverInstanceType.UNIVER_BASE:
      await exportOfficeFile({
        ...options,
        format: requireSheetLikeExportFormat(extension, "Base"),
        outputPath: request.outputPath,
        data: unitData,
        unitType: UniverInstanceType.UNIVER_BASE,
      });
      return;
    case UniverInstanceType.UNIVER_DOC:
      requireExportExtension(extension, ".docx", "Doc");
      await exportOfficeFile({
        ...options,
        format: ExchangeFormat.DOCX,
        outputPath: request.outputPath,
        data: unitData,
        unitType: UniverInstanceType.UNIVER_DOC,
      });
      return;
    case UniverInstanceType.UNIVER_SLIDE:
      requireExportExtension(extension, ".pptx", "Slide");
      await exportOfficeFile({
        ...options,
        format: ExchangeFormat.PPTX,
        outputPath: request.outputPath,
        data: unitData,
        unitType: UniverInstanceType.UNIVER_SLIDE,
      });
      return;
    default:
      throw codedError(
        "EXPORT_UNIT_TYPE_UNSUPPORTED",
        `Unit type ${String(type)} cannot be exported by this SDK`,
      );
  }
}

function requireSheetLikeExportFormat(
  extension: string,
  kind: "Sheet" | "Base",
): ExchangeFormat.XLSX | ExchangeFormat.CSV | ExchangeFormat.TSV {
  if (extension === ".xlsx") return ExchangeFormat.XLSX;
  if (extension === ".csv") return ExchangeFormat.CSV;
  if (extension === ".tsv") return ExchangeFormat.TSV;
  throw codedError(
    "EXPORT_FORMAT_MISMATCH",
    `${kind} Units must be exported to .xlsx, .csv, or .tsv files`,
  );
}

function requireExportExtension(actual: string, expected: string, kind: string): void {
  if (actual === expected) return;
  throw codedError("EXPORT_FORMAT_MISMATCH", `${kind} Units must be exported to ${expected} files`);
}
