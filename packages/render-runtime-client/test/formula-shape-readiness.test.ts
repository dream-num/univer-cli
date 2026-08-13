import { afterEach, describe, expect, it, vi } from "vitest";
import { IShapeHostAdapterRegistry } from "@univerjs-pro/engine-shape";
import { FormulaShapeResultStatus, ShapeFormulaService } from "@univerjs-pro/shape-editor";
import type { Univer } from "@univerjs/core";
import {
  waitForFormulaShapePresentation,
  waitForStableRenderedImage,
} from "../src/formula-shape-readiness.js";
import type { LoadedUnit } from "../src/units.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createHarness(initialStatus: FormulaShapeResultStatus) {
  let status = initialStatus;
  const shape = {
    unitId: "book-1",
    subUnitId: "sheet-1",
    shapeId: "shape-1",
    shapeData: { formulaBinding: { formula: "=SUM(A1:A2)" } },
  };
  const adapterRegistry = {
    get: () => ({ listShapesInUnit: () => [shape] }),
  };
  const service = {
    getResult: () => ({ status }),
  };
  const injector = {
    get(token: unknown): unknown {
      if (token === IShapeHostAdapterRegistry) return adapterRegistry;
      if (token === ShapeFormulaService) return service;
      throw new Error("unexpected dependency");
    },
  };
  const univer = { __getInjector: () => injector } as unknown as Univer;
  const unit: LoadedUnit = {
    unitKey: "sheet::1",
    unitType: "sheet",
    unitId: "book-1",
    embeddedUnitIds: [],
    referenceUnitIds: [],
    unitData: { id: "book-1" },
    lastUsedAt: 0,
  };
  return {
    univer,
    unit,
    resolve: () => {
      status = FormulaShapeResultStatus.SUCCESS;
    },
  };
}

function useFrameClock(): void {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 16),
  );
}

describe("waitForFormulaShapePresentation", () => {
  it("waits for a pending result and two final paint frames", async () => {
    useFrameClock();
    const harness = createHarness(FormulaShapeResultStatus.PENDING);
    const startedAt = Date.now();
    const waiting = waitForFormulaShapePresentation(harness.univer, harness.unit);
    const elapsedAtCompletion = waiting.then((hasFormulaShapes) => ({
      elapsed: Date.now() - startedAt,
      hasFormulaShapes,
    }));
    setTimeout(harness.resolve, 32);

    await vi.advanceTimersByTimeAsync(500);
    const { elapsed, hasFormulaShapes } = await elapsedAtCompletion;

    expect(hasFormulaShapes).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(64);
    expect(elapsed).toBeLessThan(360);
  });

  it("fails explicitly when a formula remains pending", async () => {
    useFrameClock();
    const harness = createHarness(FormulaShapeResultStatus.PENDING);
    const waiting = waitForFormulaShapePresentation(harness.univer, harness.unit, 32);
    const assertion = expect(waiting).rejects.toThrow(
      "RENDER_INTERNAL: Formula Shape calculation did not settle",
    );

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });

  it("returns only after Formula Shape pixels stay identical across final frames", async () => {
    useFrameClock();
    let captures = 0;
    const waiting = waitForStableRenderedImage(() => {
      captures += 1;
      return {
        dataUrl: captures < 4 ? `frame-${captures}` : "final-frame",
        width: 320,
        height: 180,
      };
    });

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(waiting).resolves.toEqual({
      dataUrl: "final-frame",
      width: 320,
      height: 180,
    });
    expect(captures).toBeGreaterThanOrEqual(15);
  });
});
