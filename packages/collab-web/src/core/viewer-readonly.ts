import {
  CommandType,
  CustomCommandExecutionError,
  type ICommandService
} from "@univerjs/core";
import type { UnitType } from "@univer/collab-gateway-contract";
import {
  UNIT_TYPE_BOARD,
  UNIT_TYPE_SHEET
} from "@univer/collab-gateway-contract";

type ViewerReadOnlyEnforcement = "none" | "local-authz";
export type ViewerWorkbenchChrome = "hidden" | "visible";

/** Show editing chrome only where its actions match the scope's actual capabilities. */
export function resolveViewerWorkbenchChrome(
  unitType: UnitType,
  editable: boolean
): ViewerWorkbenchChrome {
  if (unitType === UNIT_TYPE_SHEET) {
    return "visible";
  }
  if (unitType === UNIT_TYPE_BOARD) {
    return "hidden";
  }
  return editable ? "visible" : "hidden";
}

/** Resolve read-only enforcement from scope-owned editability, never from a Unit allowlist. */
export function resolveViewerReadOnlyEnforcement(
  _unitType: UnitType,
  editable: boolean
): ViewerReadOnlyEnforcement {
  return editable ? "none" : "local-authz";
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
