import {
  CommandType,
  CustomCommandExecutionError,
  type ICommandService
} from "@univerjs/core";
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
    for (const unitType of [
      UNIT_TYPE_DOC,
      UNIT_TYPE_SHEET,
      UNIT_TYPE_SLIDE,
      UNIT_TYPE_BASE,
      UNIT_TYPE_BOARD
    ]) {
      expect(resolveViewerReadOnlyEnforcement(unitType, false)).toBe("local-authz");
    }
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
