import type { ICellData, Workbook } from "@univerjs/core";
import type { ResourceRefInput } from "@univerjs-pro/embed";
import type { ISetFormulaCalculationResultMutation } from "@univerjs/engine-formula";
import { UniverInstanceType } from "@univerjs/core";
import { ReferencedUnitDataType } from "@univerjs-pro/embed";
import { describe, expect, it, vi } from "vitest";
import { createCollaborationSheetResourceRefDataProvider } from "../src/core/collaboration-sheet-resource-ref-data-provider";

describe("Collaboration Sheet ResourceRef data provider", () => {
  it("returns persisted values immediately when the requested range has no formulas", async () => {
    const harness = createHarness([[{ v: 10 }, { v: 20 }]]);

    await expect(harness.readData()).resolves.toEqual({
      type: ReferencedUnitDataType.RANGE,
      values: [[10, 20]]
    });
    expect(harness.waitForFormulaResultApplied).not.toHaveBeenCalled();
    expect(harness.executeFormulaCalculation).not.toHaveBeenCalled();
  });

  it("waits outside the Host calculation for Source formulas and refreshes each update once", async () => {
    const harness = createHarness([
      [{ f: "=A2*B2", v: 3289 }],
      [{ f: "=A3*B3", v: 1548 }],
      [{ f: "=A4*B4", v: 995 }],
      [{ f: "=A5*B5", v: 1180 }]
    ]);

    await expect(harness.readData()).rejects.toThrow(
      "Referenced Sheet formulas are pending: source-sheet"
    );

    const settling = harness.provider.formulaResultApplied(formulaResultFor("host-doc"))!;
    expect(harness.waitForFormulaResultApplied).toHaveBeenCalledOnce();
    expect(harness.executeFormulaCalculation).not.toHaveBeenCalled();

    harness.setCells([
      [{ f: "=A2*B2", v: 2392 }],
      [{ f: "=A3*B3", v: 100233 }],
      [{ f: "=A4*B4", v: 199 }],
      [{ f: "=A5*B5", v: 1180 }]
    ]);
    harness.resolveWait(0);
    await flushAsyncWork();

    expect(harness.waitForFormulaResultApplied).toHaveBeenCalledTimes(2);
    expect(harness.executeFormulaCalculation).toHaveBeenCalledOnce();
    await expect(harness.readData()).resolves.toEqual({
      type: ReferencedUnitDataType.RANGE,
      values: [[2392], [100233], [199], [1180]]
    });

    harness.provider.formulaResultApplied(formulaResultFor("source-sheet"));
    expect(harness.executeFormulaCalculation).toHaveBeenCalledOnce();
    harness.resolveWait(1);
    await settling;

    const refreshing = harness.provider.formulaResultApplied(formulaResultFor("source-sheet"))!;
    await flushAsyncWork();
    expect(harness.waitForFormulaResultApplied).toHaveBeenCalledTimes(3);
    expect(harness.executeFormulaCalculation).toHaveBeenCalledTimes(2);

    harness.provider.formulaResultApplied(formulaResultFor("source-sheet"));
    expect(harness.executeFormulaCalculation).toHaveBeenCalledTimes(2);
    harness.resolveWait(2);
    await refreshing;

    harness.provider.dispose();
  });
});

function createHarness(initialCells: ICellData[][]) {
  let cells = initialCells;
  const waits: Array<{ promise: Promise<void>; resolve: () => void }> = [];
  const waitForFormulaResultApplied = vi.fn(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((next) => {
      resolve = next;
    });
    waits.push({ promise, resolve });
    return promise;
  });
  const executeFormulaCalculation = vi.fn();
  const worksheet = {
    getRange: vi.fn(() => ({ getValues: () => cells }))
  };
  const workbook = {
    getSheetBySheetId: vi.fn(() => worksheet),
    getSheetBySheetName: vi.fn(() => worksheet)
  } as unknown as Workbook;
  const provider = createCollaborationSheetResourceRefDataProvider(() => ({
    referencedUnitManager: {
      ensure: vi.fn(async () => ({
        ref: "univer://self#unit=source-sheet&type=sheet",
        unitId: "source-sheet",
        unitType: UniverInstanceType.UNIVER_SHEET
      }))
    },
    univerInstanceService: {
      getUnit: vi.fn(() => workbook)
    },
    waitForFormulaResultApplied,
    executeFormulaCalculation
  }));
  const ref: ResourceRefInput = {
    file: { kind: "self" },
    unit: { selector: "source-sheet", type: "sheet" },
    part: {
      kind: "range",
      ref: "Data!D2:D5",
      sheetName: "Data",
      sheetId: "data-sheet",
      range: "D2:D5"
    }
  };

  return {
    provider,
    waitForFormulaResultApplied,
    executeFormulaCalculation,
    setCells(next: ICellData[][]): void {
      cells = next;
    },
    resolveWait(index: number): void {
      waits[index]?.resolve();
    },
    readData: () =>
      provider.registration.provider.readData({
        ref,
        unitType: UniverInstanceType.UNIVER_SHEET,
        dataType: ReferencedUnitDataType.RANGE,
        selector: ref.part!,
        signal: undefined
      })
  };
}

function formulaResultFor(unitId: string): ISetFormulaCalculationResultMutation {
  return {
    unitData: { [unitId]: {} },
    unitOtherData: {}
  } as ISetFormulaCalculationResultMutation;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
