import type { IWorkbookData, Workbook } from "@univerjs/core";
import { EventSubject, ICommandService, LifecycleService, LifecycleStages, LocaleType, Univer, UniverInstanceType } from "@univerjs/core";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { IRenderManagerService } from "@univerjs/engine-render";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { FWorkbook } from "@univerjs/sheets/facade";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsNumfmtPlugin } from "@univerjs/sheets-numfmt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDocumentViewPosition } from "../src/core/document-view-position";
import { registerFormulaTextDisplay } from "../../unit-comparison-viewer/src/sheet/formula-text-display";

const instances: Univer[] = [];
afterEach(() => { for (const univer of instances.splice(0)) univer.dispose(); });
function instance(): Univer {
  const univer = new Univer();
  instances.push(univer);
  return univer;
}

describe("published SDK formula display", () => {
  function setup(): { univer: Univer; model: Workbook; workbook: FWorkbook; refresh: ReturnType<typeof vi.fn>; resetCache: ReturnType<typeof vi.fn> } {
    const univer = instance();
    const injector = univer.__getInjector();
    const refresh = vi.fn();
    const resetCache = vi.fn();
    injector.add([IRenderManagerService, { useValue: {
      getRenderUnitById: () => ({
        with: () => ({ getSkeleton: () => ({ resetCache, makeDirty: vi.fn() }), reCalculate: refresh }),
        mainComponent: { makeDirty: vi.fn() }
      })
    } }]);
    univer.registerPlugin(UniverFormulaEnginePlugin, { notExecuteFormula: true });
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsNumfmtPlugin);
    const snapshot: IWorkbookData = {
      id: "formula-test", name: "Formulas", appVersion: "1", locale: LocaleType.EN_US,
      styles: {}, sheetOrder: ["sheet"], sheets: { sheet: {
        id: "sheet", name: "Sheet", rowCount: 20, columnCount: 5,
        cellData: {
          0: { 0: { v: 5 }, 1: { f: "=A1*2", si: "shared", v: 10 }, 2: { f: "=A1/10", v: .5, s: { n: { pattern: "0%" } } } },
          1: { 0: { v: 7 }, 1: { si: "shared", v: 14 }, 2: { f: "=1/0", v: "#DIV/0!" } },
          2: { 0: { v: "plain" }, 1: { f: "='Other sheet'!$A$1+1", v: 42 } }
        }
      } }
    };
    const model = univer.createUnit<IWorkbookData, Workbook>(UniverInstanceType.UNIVER_SHEET, snapshot);
    return { univer, model, workbook: injector.createInstance(FWorkbook, model), refresh, resetCache };
  }

  it("uses real SDK interceptors for shared, formatted and error formulas without changing data or executing commands", () => {
    const { univer, workbook, model, refresh, resetCache } = setup();
    const sheet = model.getSheets()[0]!;
    const original = JSON.stringify(model.getSnapshot());
    const command = vi.fn();
    const listener = univer.__getInjector().get(ICommandService).onCommandExecuted(command);
    for (let cycle = 0; cycle < 3; cycle++) {
      const display = registerFormulaTextDisplay(univer, workbook);
      expect(sheet.getCell(0, 1)).toMatchObject({ v: "=A1*2", p: null });
      expect(sheet.getCell(1, 1)?.v).toBe("=A2*2");
      expect(sheet.getCell(0, 2)?.v).toBe("=A1/10");
      expect(sheet.getCell(1, 2)?.v).toBe("=1/0");
      expect(sheet.getCell(2, 1)?.v).toBe("='Other sheet'!$A$1+1");
      expect(sheet.getCell(0, 0)?.v).toBe(5);
      expect(sheet.getCell(2, 0)?.v).toBe("plain");
      expect(sheet.getCell(10, 0)).toBeUndefined();
      display.dispose();
      display.dispose();
      expect(sheet.getCell(0, 1)?.v).toBe(10);
      expect(sheet.getCell(1, 1)?.v).toBe(14);
      expect(sheet.getCell(0, 2)?.v).toBe("50%");
      expect(sheet.getCell(1, 2)?.v).toBe("#DIV/0!");
      expect(JSON.stringify(model.getSnapshot())).toBe(original);
    }
    expect(refresh).toHaveBeenCalledTimes(6);
    expect(resetCache).toHaveBeenCalledTimes(6);
    expect(command).not.toHaveBeenCalled();
    listener.dispose();
  });

  it("keeps independent registrations and other workbooks isolated", () => {
    const { univer, workbook, model } = setup();
    const other = univer.createUnit<IWorkbookData, Workbook>(UniverInstanceType.UNIVER_SHEET, { ...structuredClone(model.getSnapshot()), id: "other" });
    const first = registerFormulaTextDisplay(univer, workbook);
    const second = registerFormulaTextDisplay(univer, workbook);
    expect(other.getSheets()[0]!.getCell(0, 1)?.v).toBe(10);
    first.dispose();
    expect(model.getSheets()[0]!.getCell(0, 1)?.v).toBe("=A1*2");
    second.dispose();
    expect(model.getSheets()[0]!.getCell(0, 1)?.v).toBe(10);
  });
});

describe("live Doc first visible position", () => {
  function setup(): { univer: Univer; lifecycle: LifecycleService; engine: { width: number; height: number; onTransformChange$: EventSubject<unknown> }; position: ReturnType<typeof vi.fn> } {
    const univer = instance();
    const injector = univer.__getInjector();
    const position = vi.fn();
    const engine = { width: 1, height: 1, onTransformChange$: new EventSubject<unknown>() };
    injector.add([IRenderManagerService, { useValue: {
      getRenderUnitById: (id: string) => id === "doc" ? { engine, with: () => ({ calculatePagePosition: position }) } : null
    } }]);
    return { univer, lifecycle: injector.get(LifecycleService), engine, position };
  }

  it("positions after mount even when the first resize precedes Rendered", () => {
    const { univer, lifecycle, engine, position } = setup();
    const disposable = initializeDocumentViewPosition(univer, "doc");
    engine.width = 960; engine.height = 600;
    engine.onTransformChange$.emitEvent({});
    expect(position).not.toHaveBeenCalled();
    lifecycle.stage = LifecycleStages.Rendered;
    expect(position).toHaveBeenCalledTimes(1);
    engine.onTransformChange$.emitEvent({});
    expect(position).toHaveBeenCalledTimes(1);
    disposable.dispose();
  });

  it("waits for a hidden container to obtain a real size", () => {
    const { univer, lifecycle, engine, position } = setup();
    lifecycle.stage = LifecycleStages.Rendered;
    const disposable = initializeDocumentViewPosition(univer, "doc");
    engine.onTransformChange$.emitEvent({});
    expect(position).not.toHaveBeenCalled();
    engine.width = 960; engine.height = 600;
    engine.onTransformChange$.emitEvent({});
    expect(position).toHaveBeenCalledTimes(1);
    disposable.dispose();
  });

  it.each([false, true])("cancels positioning when disposed (already rendered: %s)", (rendered) => {
    const { univer, lifecycle, engine, position } = setup();
    if (rendered) lifecycle.stage = LifecycleStages.Rendered;
    const disposable = initializeDocumentViewPosition(univer, "doc");
    disposable.dispose();
    if (!rendered) lifecycle.stage = LifecycleStages.Rendered;
    engine.width = 960; engine.height = 600;
    engine.onTransformChange$.emitEvent({});
    expect(position).not.toHaveBeenCalled();
  });
});
