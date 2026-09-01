import {
  CommandType,
  CustomCommandExecutionError,
  type ICommandService,
  type IPermissionService
} from "@univerjs/core";
import {
  WorkbookCreateProtectPermission,
  WorkbookEditablePermission,
  WorkbookPrintPermission
} from "@univerjs/sheets";
import { setDocumentPermissionValue } from "@univerjs/docs";
import { setSlidePermissionValue } from "@univerjs-pro/slides";
import { setBasePermissionValue } from "@univerjs-pro/bases";
import { setBoardPermissionValue } from "@univerjs-pro/boards";
import { UnitAction } from "@univerjs/protocol";
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from "@univer/collab-gateway-contract";

type ViewerReadOnlyEnforcement = "none" | "sheet-permission" | "mutation-gate";

/** Resolve read-only enforcement from scope-owned editability, never from a Unit allowlist. */
export function resolveViewerReadOnlyEnforcement(
  unitType: UnitType,
  editable: boolean
): ViewerReadOnlyEnforcement {
  if (editable) {
    return "none";
  }
  return unitType === UNIT_TYPE_SHEET ? "sheet-permission" : "mutation-gate";
}

/** Disable Sheet actions whose Ribbon state is governed by dedicated workbook permissions. */
export function enforceSheetViewerReadOnlyPermissions(
  permissionService: Pick<
    IPermissionService,
    "addPermissionPoint" | "getPermissionPoint" | "updatePermissionPoint"
  >,
  unitId: string
): void {
  const points = [
    new WorkbookEditablePermission(unitId),
    new WorkbookCreateProtectPermission(unitId),
    new WorkbookPrintPermission(unitId)
  ];
  for (const point of points) {
    if (!permissionService.getPermissionPoint(point.id)) {
      permissionService.addPermissionPoint(point);
    }
    permissionService.updatePermissionPoint(point.id, false);
  }
}

/** Apply the product's public unit-level Edit permission after preview mutations are materialized. */
export function enforceUnitViewerReadOnlyPermission(
  permissionService: IPermissionService,
  unitType: UnitType,
  unitId: string
): void {
  if (unitType === UNIT_TYPE_SHEET) {
    enforceSheetViewerReadOnlyPermissions(permissionService, unitId);
  } else if (unitType === UNIT_TYPE_DOC) {
    setDocumentPermissionValue(permissionService, unitId, unitId, UnitAction.Edit, false);
  } else if (unitType === UNIT_TYPE_SLIDE) {
    setSlidePermissionValue(permissionService, unitId, unitId, UnitAction.Edit, false);
  } else if (unitType === UNIT_TYPE_BASE) {
    setBasePermissionValue(permissionService, unitId, unitId, UnitAction.Edit, false);
  } else if (unitType === UNIT_TYPE_BOARD) {
    setBoardPermissionValue(permissionService, unitId, unitId, UnitAction.Edit, false);
  }
}

/** Keep a viewer navigable while accepting model changes that stay outside collaboration submit. */
export function blockLocalEditingCommands(
  commandService: Pick<ICommandService, "beforeCommandExecuted">
): void {
  commandService.beforeCommandExecuted((commandInfo, options) => {
    if (
      commandInfo.type === CommandType.MUTATION &&
      options?.fromCollab !== true &&
      options?.onlyLocal !== true
    ) {
      throw new CustomCommandExecutionError("viewer is read-only");
    }
  });
}
