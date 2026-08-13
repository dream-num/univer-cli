import { CommandType, CustomCommandExecutionError, type ICommandService } from "@univerjs/core";
import { UNIT_TYPE_SHEET, type UnitType } from "@univer/collab-gateway-contract";

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
