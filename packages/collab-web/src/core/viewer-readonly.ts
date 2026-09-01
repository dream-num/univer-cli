import {
  CommandType,
  CustomCommandExecutionError,
  type ICommandService
} from "@univerjs/core";
import type { UnitType } from "@univer/collab-gateway-contract";

type ViewerReadOnlyEnforcement = "none" | "local-authz";

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
