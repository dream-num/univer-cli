import { afterEach, describe, expect, it, vi } from "vitest";
import { IUniverInstanceService, type Univer } from "@univerjs/core";
import { prepareBaseView, waitForStableBaseLayout } from "../src/base-ops.js";
import type { LoadedUnit } from "../src/units.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): Pick<DOMRect, "x" | "y" | "left" | "top" | "right" | "bottom" | "width" | "height"> {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
  };
}

describe("Base capture readiness", () => {
  it("requires eight consecutive stable layout frames", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const stable = {
      clip: { x: 0, y: 20, width: 1000, height: 780 },
      signature: "stable",
    };
    const read = vi
      .fn<() => typeof stable | null>()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ ...stable, signature: "first" })
      .mockReturnValue(stable);

    await expect(waitForStableBaseLayout(read)).resolves.toEqual(stable);
    expect(read).toHaveBeenCalledTimes(10);
  });

  it("uses the active Base state and exact unit canvas without CSS-interpolating the id", async () => {
    const unitId = 'base"]#unsafe';
    const exactCanvas = {
      id: `univer-base-main-canvas_${unitId}`,
      width: 2400,
      height: 1600,
      getBoundingClientRect: () => rect(200, 160, 800, 600),
    };
    const otherCanvas = {
      id: "univer-base-main-canvas_other",
      width: 2400,
      height: 1600,
      getBoundingClientRect: () => rect(200, 160, 800, 600),
    };
    const canvasRoot = {
      dataset: { baseUnitId: unitId },
      getBoundingClientRect: () => rect(200, 160, 800, 600),
      querySelectorAll: vi.fn((selector: string) => {
        expect(selector).toBe("canvas");
        return [otherCanvas, exactCanvas];
      }),
    };
    const workbench = {
      getBoundingClientRect: () => rect(-10, 20, 1110, 880),
    };
    vi.stubGlobal("document", {
      fonts: { ready: Promise.resolve() },
      querySelector: vi.fn((selector: string) => {
        expect(selector).toBe('[data-u-comp="base-workbench-layout"]');
        return workbench;
      }),
      querySelectorAll: vi.fn((selector: string) => {
        expect(selector).toBe('[data-u-comp="base-canvas-root"]');
        return [canvasRoot];
      }),
    });
    vi.stubGlobal("window", { innerWidth: 1000, innerHeight: 800 });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    const formulaReady = vi.fn(async () => undefined);
    const getRenderedView = vi.fn(() => {
      throw new Error("the upstream facade method is not implemented");
    });
    const stopEditingCell = vi.fn();
    const setSelection = vi.fn();
    const focusUnit = vi.fn();
    const setCurrentUnitForType = vi.fn();
    const univer = {
      __getInjector: () => ({
        get: (token: unknown) => {
          if (token === IUniverInstanceService) {
            return { focusUnit, setCurrentUnitForType };
          }
          throw new Error("unexpected dependency");
        },
      }),
    } as unknown as Univer;
    const univerAPI = {
      getBase: (id: string) => (id === unitId ? {} : null),
      getBaseUI: () => ({
        getActiveTableId: () => "table-1",
        getActiveViewId: () => "view-1",
        getRenderedView,
        stopEditingCell,
        setSelection,
      }),
      getFormula: () => ({ onCalculationResultApplied: formulaReady }),
    };
    const unit: LoadedUnit = {
      unitKey: "base-key",
      unitType: "base",
      unitId,
      embeddedUnitIds: [],
      referenceUnitIds: [],
      unitData: { id: unitId },
      lastUsedAt: 0,
    };

    await expect(prepareBaseView(univer, univerAPI as never, unit)).resolves.toEqual({
      clip: { x: 0, y: 20, width: 1000, height: 780 },
    });
    expect(formulaReady).toHaveBeenCalledWith(5_000);
    expect(stopEditingCell).toHaveBeenCalledOnce();
    expect(setSelection).toHaveBeenCalledWith(null);
    expect(focusUnit).toHaveBeenCalledWith(unitId);
    expect(setCurrentUnitForType).toHaveBeenCalledWith(unitId);
    expect(getRenderedView).not.toHaveBeenCalled();
    expect(canvasRoot.querySelectorAll).toHaveBeenCalledTimes(8);
  });
});
