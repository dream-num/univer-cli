import { afterEach, describe, expect, it, vi } from "vitest";
import type { ICreateUnitOptions } from "@univerjs/core";
import { IUniverInstanceService, UniverInstanceType, type Univer } from "@univerjs/core";
import { IRenderManagerService } from "@univerjs/engine-render";
import { UnitRegistry } from "../src/units.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createHarness(options: { canvasReady?: boolean; renderReadyAfterMs?: number } = {}) {
  const created: Array<{
    type: UniverInstanceType;
    id: unknown;
    options?: ICreateUnitOptions;
  }> = [];
  const disposed: string[] = [];
  const focused: string[] = [];
  const renders = new Map<string, object>();
  const instanceService = {
    createUnit: (
      type: UniverInstanceType,
      data: { readonly id?: unknown },
      createOptions?: ICreateUnitOptions,
    ) => registerUnit(type, data, createOptions),
    focusUnit: (unitId: string) => focused.push(unitId),
    setCurrentUnitForType: vi.fn(),
    disposeUnit: (unitId: string) => disposed.push(unitId),
  };
  const registerUnit = (
    type: UniverInstanceType,
    data: { readonly id?: unknown },
    createOptions?: ICreateUnitOptions,
  ): void => {
    created.push({
      type,
      id: data.id,
      ...(createOptions === undefined ? {} : { options: createOptions }),
    });
    if (typeof data.id === "string") {
      const register = () => renders.set(data.id as string, {});
      if (options.renderReadyAfterMs === undefined) {
        register();
      } else {
        setTimeout(register, options.renderReadyAfterMs);
      }
    }
  };
  const univer = {
    createUnit: (type: UniverInstanceType, data: { readonly id?: unknown }) =>
      registerUnit(type, data),
    __getInjector: () => ({
      get: (token: unknown) => {
        if (token === IUniverInstanceService) return instanceService;
        if (token === IRenderManagerService) {
          return { getRenderUnitById: (unitId: string) => renders.get(unitId) };
        }
        throw new Error("unexpected dependency");
      },
    }),
  } as unknown as Univer;
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 1),
  );
  vi.stubGlobal("document", {
    querySelectorAll: () =>
      options.canvasReady === false ? [] : [{ clientWidth: 800, clientHeight: 600 }],
  });
  return { registry: new UnitRegistry(univer), created, disposed, focused };
}

describe("UnitRegistry dependency closure", () => {
  it("waits for the target render registration after a generic canvas is ready", async () => {
    const harness = createHarness({ renderReadyAfterMs: 400 });
    let resolved = false;
    const loading = harness.registry
      .load({
        unitKey: "doc::r1",
        unitType: "doc",
        unitData: { id: "doc-1" },
      })
      .then((value) => {
        resolved = true;
        return value;
      });

    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(loading).resolves.toEqual({ unitKey: "doc::r1", loaded: true });
  });

  it("creates a Base target without applying the generic workbench canvas gate", async () => {
    const harness = createHarness({ canvasReady: false });
    const loading = harness.registry.load({
      unitKey: "base::r1",
      unitType: "base",
      unitData: { id: "base-1" },
    });

    const result = expect(loading).resolves.toEqual({ unitKey: "base::r1", loaded: true });
    await vi.advanceTimersByTimeAsync(6_000);
    await result;
    expect(harness.created).toEqual([{ type: UniverInstanceType.UNIVER_BASE, id: "base-1" }]);
    expect(harness.focused).toEqual(["base-1"]);
  });

  it("creates Source Units before Host and disposes the complete session closure", async () => {
    const harness = createHarness();
    const loading = harness.registry.load({
      unitKey: "host::r1::source::r2",
      unitType: "sheet",
      unitData: { id: "host" },
      formulaReferenceUnits: [
        {
          unitId: "source-base",
          unitType: "base",
          unitData: { id: "source-base" },
        },
      ],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(loading).resolves.toEqual({ unitKey: "host::r1::source::r2", loaded: true });
    expect(harness.created).toEqual([
      {
        type: UniverInstanceType.UNIVER_BASE,
        id: "source-base",
        options: { makeCurrent: false, skipAutoRender: true, embeddedRender: true },
      },
      { type: UniverInstanceType.UNIVER_SHEET, id: "host" },
    ]);
    expect(harness.focused).toEqual(["host"]);

    harness.registry.disposeUnit("host::r1::source::r2");

    expect(harness.disposed).toEqual(["host", "source-base"]);
  });

  it("rejects a Source snapshot whose id does not match its declared Unit id", async () => {
    const harness = createHarness();

    await expect(
      harness.registry.load({
        unitKey: "host::r1",
        unitType: "sheet",
        unitData: { id: "host" },
        formulaReferenceUnits: [
          {
            unitId: "source-sheet",
            unitType: "sheet",
            unitData: { id: "wrong-source" },
          },
        ],
      }),
    ).rejects.toThrow(
      "RENDER_INTERNAL: Formula reference Unit snapshot id mismatch: expected source-sheet",
    );
    expect(harness.created).toHaveLength(0);
  });

  it("creates embedded Units before the Host and disposes them with the session", async () => {
    const harness = createHarness();
    const loading = harness.registry.load({
      unitKey: "slide::r1::embed::r2",
      unitType: "slide",
      unitData: { id: "slide-host" },
      embeddedUnits: [
        {
          unitId: "embedded-sheet",
          unitType: "sheet",
          unitData: { id: "embedded-sheet" },
        },
      ],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(loading).resolves.toEqual({ unitKey: "slide::r1::embed::r2", loaded: true });
    expect(harness.created).toEqual([
      {
        type: UniverInstanceType.UNIVER_SHEET,
        id: "embedded-sheet",
        options: { makeCurrent: false, skipAutoRender: true, embeddedRender: true },
      },
      { type: UniverInstanceType.UNIVER_SLIDE, id: "slide-host" },
    ]);

    harness.registry.disposeUnit("slide::r1::embed::r2");
    expect(harness.disposed).toEqual(["slide-host", "embedded-sheet"]);
  });

  it("creates a shared Formula Source and Embed child once with the SDK child contract", async () => {
    const harness = createHarness();
    const shared = {
      unitId: "shared-sheet",
      unitType: "sheet" as const,
      unitData: { id: "shared-sheet" },
    };
    const loading = harness.registry.load({
      unitKey: "doc::shared-source",
      unitType: "doc",
      unitData: { id: "doc-host" },
      formulaReferenceUnits: [shared],
      embeddedUnits: [shared],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(loading).resolves.toEqual({ unitKey: "doc::shared-source", loaded: true });
    expect(harness.created).toEqual([
      {
        type: UniverInstanceType.UNIVER_SHEET,
        id: "shared-sheet",
        options: { makeCurrent: false, skipAutoRender: true, embeddedRender: true },
      },
      { type: UniverInstanceType.UNIVER_DOC, id: "doc-host" },
    ]);
  });
});
