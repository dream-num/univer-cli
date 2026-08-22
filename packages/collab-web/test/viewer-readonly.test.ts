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
import { describe, expect, it } from "vitest";
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE
} from "@univer/collab-gateway-contract";
import {
  blockLocalEditingCommands,
  enforceSheetViewerReadOnlyPermissions,
  resolveViewerReadOnlyEnforcement
} from "../src/core/viewer-readonly";

describe("viewer read-only command policy", () => {
  it("allows every trunk Unit when the scope is editable", () => {
    for (const unitType of [
      UNIT_TYPE_DOC,
      UNIT_TYPE_SHEET,
      UNIT_TYPE_SLIDE,
      UNIT_TYPE_BASE,
      UNIT_TYPE_BOARD
    ]) {
      expect(resolveViewerReadOnlyEnforcement(unitType, true)).toBe("none");
    }
  });

  it("uses the available read-only gate for every non-editable Unit", () => {
    expect(resolveViewerReadOnlyEnforcement(UNIT_TYPE_SHEET, false)).toBe("sheet-permission");
    for (const unitType of [UNIT_TYPE_DOC, UNIT_TYPE_SLIDE, UNIT_TYPE_BASE, UNIT_TYPE_BOARD]) {
      expect(resolveViewerReadOnlyEnforcement(unitType, false)).toBe("mutation-gate");
    }
  });

  it("disables Sheet editing, protection, and printing in a read-only viewer", () => {
    const added: string[] = [];
    const updated: Array<[string, boolean]> = [];
    const permissionService = {
      getPermissionPoint: () => undefined,
      addPermissionPoint: (point: { id: string }) => {
        added.push(point.id);
      },
      updatePermissionPoint: (id: string, value: boolean) => {
        updated.push([id, value]);
      }
    } as unknown as Pick<
      IPermissionService,
      "addPermissionPoint" | "getPermissionPoint" | "updatePermissionPoint"
    >;

    enforceSheetViewerReadOnlyPermissions(permissionService, "book-1");

    const expected = [
      new WorkbookEditablePermission("book-1").id,
      new WorkbookCreateProtectPermission("book-1").id,
      new WorkbookPrintPermission("book-1").id
    ];
    expect(added).toEqual(expected);
    expect(updated).toEqual(expected.map((id) => [id, false]));
  });

  it("blocks mutations that enter collaboration submit", () => {
    let listener: Parameters<ICommandService["beforeCommandExecuted"]>[0] | undefined;
    const commandService = {
      beforeCommandExecuted: (next: NonNullable<typeof listener>) => {
        listener = next;
        return { dispose: () => undefined };
      }
    };

    blockLocalEditingCommands(commandService);

    expect(() => listener?.({ id: "board.local", type: CommandType.MUTATION }, {})).toThrow(
      CustomCommandExecutionError
    );
    expect(() =>
      listener?.({ id: "board.remote", type: CommandType.MUTATION }, { fromCollab: true })
    ).not.toThrow();
    expect(() =>
      listener?.({ id: "formula.derived", type: CommandType.MUTATION }, { onlyLocal: true })
    ).not.toThrow();
    expect(() =>
      listener?.({ id: "board.selection", type: CommandType.OPERATION }, {})
    ).not.toThrow();
  });
});
