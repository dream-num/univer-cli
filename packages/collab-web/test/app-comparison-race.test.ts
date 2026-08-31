// @vitest-environment jsdom
import type {
  CreateUnitComparisonResponse,
  UnitComparisonContextResponse,
  UnitComparisonRefRequest,
  UnitComparisonResponse,
} from "@univer/collab-gateway-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/ui/app";
import { attachLinkedWheelNavigation } from "../src/ui/app-view";
import { UniverInstanceType } from "@univerjs/core";

vi.mock("../src/core/viewer", () => ({
  createPreviewViewer: vi.fn(),
  createViewer: vi.fn(),
  decodeComparisonUnitData: vi.fn(async (_type: number, snapshot: unknown) => snapshot),
}));

interface ComparisonControl {
  createUnitComparison: ReturnType<typeof vi.fn>;
  getUnitComparison: ReturnType<typeof vi.fn>;
  getUnitComparisonContext: ReturnType<typeof vi.fn>;
}

interface AppInternals {
  control: ComparisonControl;
  view: { kind: "worktree"; worktreeId: string };
  comparisonMode: boolean;
}

describe("comparison request races", () => {
  const apps: App[] = [];

  beforeEach(() => {
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
  });

  afterEach(() => {
    for (const app of apps.splice(0)) app.dispose();
    document.body.innerHTML = "";
  });

  it("relays wheel gestures inside the peer viewport without echoing, and detaches on disposal", () => {
    const left = document.createElement("div");
    const right = document.createElement("div");
    const canvas = document.createElement("canvas");
    right.append(canvas);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(500, 600, 300, 200));
    const leftEvents = vi.fn();
    const rightEvents = vi.fn();
    left.addEventListener("wheel", leftEvents);
    right.addEventListener("wheel", rightEvents);
    const dispose = attachLinkedWheelNavigation(left, right);
    left.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, ctrlKey: true, bubbles: true }));
    expect(leftEvents).toHaveBeenCalledTimes(1);
    expect(rightEvents).toHaveBeenCalledTimes(1);
    expect(rightEvents.mock.calls[0]?.[0]).toMatchObject({ deltaY: 120, ctrlKey: true, clientX: 650, clientY: 700 });
    dispose();
    left.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
    expect(rightEvents).toHaveBeenCalledTimes(1);
  });

  it("finishes Doc alignment pagination even when there are no more changed items", async () => {
    const { app, control } = createComparisonApp(apps, "wt-right");
    const session = comparisonSession("cmp-current", "wt-right", { kind: "trunk" }, true);
    control.createUnitComparison.mockResolvedValue({ ...session, units: [
      { unitId: "unit-1", type: UniverInstanceType.UNIVER_DOC, name: "Doc", presence: "paired" },
    ] });
    const source = unitComparison("cmp-current");
    control.getUnitComparison.mockResolvedValue({ ...source, unit: { ...source.unit, type: UniverInstanceType.UNIVER_DOC } });
    const context = unitComparisonContext().context!;
    const row = (index: number) => ({
      id: String(index), stableId: `p${index}`, kind: "equal" as const, moved: false,
      leftIndex: index, rightIndex: index, leftNativeStableId: `p${index}`, rightNativeStableId: `p${index}`,
    });
    for (const offset of [0, 1000]) {
      const rows = Array.from({ length: offset === 0 ? 1000 : 3 }, (_, index) => row(offset + index));
      control.getUnitComparisonContext.mockResolvedValueOnce({
        error: { code: 1, message: "" },
        context: { ...context, productContext: {
          kind: "doc", paragraphAlignment: {
            total: 1003, rows, page: { offset, limit: 1000, matched: 1003, hasMore: offset === 0 },
          },
        } },
      });
    }
    await app.refreshUnitComparison();
    expect(control.getUnitComparisonContext).toHaveBeenCalledTimes(2);
    expect(control.getUnitComparisonContext.mock.calls[1]?.[3]).toMatchObject({ offset: 0, contextOffset: 1000 });
    const product = app.getSnapshot().comparisonData?.context.productContext;
    expect(product?.kind).toBe("doc");
    if (product?.kind !== "doc") throw new Error("Expected Doc context");
    expect(product.paragraphAlignment.rows).toHaveLength(1003);
    expect(product.paragraphAlignment.page.hasMore).toBe(false);
  });

  it("keeps the newest source session busy when an older create request succeeds", async () => {
    const oldRequest = deferred<CreateUnitComparisonResponse>();
    const currentRequest = deferred<CreateUnitComparisonResponse>();
    const { app, control } = createComparisonApp(apps, "wt-right");
    control.createUnitComparison
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const oldRefresh = app.refreshUnitComparison();
    const currentRefresh = app.setComparisonLeft({ kind: "worktree", worktreeId: "wt-left" });

    oldRequest.resolve(comparisonSession("cmp-old", "wt-right", { kind: "trunk" }));
    await oldRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: true,
      comparisonError: undefined,
      comparisonSession: undefined,
    });

    currentRequest.resolve(
      comparisonSession("cmp-current", "wt-right", {
        kind: "worktree",
        worktreeId: "wt-left",
      }),
    );
    await currentRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: false,
      comparisonError: undefined,
      comparisonSession: { comparisonId: "cmp-current" },
    });
  });

  it("ignores an older worktree request rejection and its finally state", async () => {
    const oldRequest = deferred<CreateUnitComparisonResponse>();
    const currentRequest = deferred<CreateUnitComparisonResponse>();
    const { app, control, internals } = createComparisonApp(apps, "wt-old");
    control.createUnitComparison
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const oldRefresh = app.refreshUnitComparison();
    internals.view = { kind: "worktree", worktreeId: "wt-current" };
    const currentRefresh = app.refreshUnitComparison();

    oldRequest.reject(new Error("old worktree failed"));
    await oldRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: true,
      comparisonError: undefined,
      comparisonSession: undefined,
    });

    currentRequest.resolve(comparisonSession("cmp-current", "wt-current", { kind: "trunk" }));
    await currentRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: false,
      comparisonError: undefined,
      comparisonSession: { comparisonId: "cmp-current" },
      view: { kind: "worktree", worktreeId: "wt-current" },
    });
  });

  it("ignores stale unit-load errors while the newer session is still loading", async () => {
    const oldUnitRequest = deferred<UnitComparisonResponse>();
    const currentUnitRequest = deferred<UnitComparisonResponse>();
    const { app, control } = createComparisonApp(apps, "wt-right");
    control.createUnitComparison
      .mockResolvedValueOnce(comparisonSession("cmp-old", "wt-right", { kind: "trunk" }, true))
      .mockResolvedValueOnce(
        comparisonSession("cmp-current", "wt-right", { kind: "trunk" }, true),
      );
    control.getUnitComparison
      .mockImplementationOnce(() => oldUnitRequest.promise)
      .mockImplementationOnce(() => currentUnitRequest.promise);

    const oldRefresh = app.refreshUnitComparison();
    await vi.waitFor(() => expect(control.getUnitComparison).toHaveBeenCalledTimes(1));
    const currentRefresh = app.refreshUnitComparison();
    await vi.waitFor(() => expect(control.getUnitComparison).toHaveBeenCalledTimes(2));

    oldUnitRequest.reject(new Error("old unit failed"));
    await oldRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: true,
      comparisonError: undefined,
      comparisonSession: { comparisonId: "cmp-current" },
      comparisonData: undefined,
    });

    currentUnitRequest.resolve(unitComparison("cmp-current"));
    await currentRefresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: false,
      comparisonError: undefined,
      comparisonSession: { comparisonId: "cmp-current" },
      comparisonData: { response: { comparisonId: "cmp-current" } },
    });
  });

  it("releases comparison-owned busy state when comparison mode is left", async () => {
    const pendingRequest = deferred<CreateUnitComparisonResponse>();
    const { app, control } = createComparisonApp(apps, "wt-right");
    control.createUnitComparison.mockImplementationOnce(() => pendingRequest.promise);

    const refresh = app.refreshUnitComparison();
    expect(app.getSnapshot().busy).toBe(true);

    await app.setComparisonMode(false);
    expect(app.getSnapshot()).toMatchObject({
      busy: false,
      comparisonData: undefined,
      comparisonError: undefined,
      comparisonSession: undefined,
    });

    pendingRequest.resolve(comparisonSession("cmp-stale", "wt-right", { kind: "trunk" }));
    await refresh;

    expect(app.getSnapshot()).toMatchObject({
      busy: false,
      comparisonData: undefined,
      comparisonError: undefined,
      comparisonSession: undefined,
    });
  });
});

function createComparisonApp(
  apps: App[],
  worktreeId: string,
): { readonly app: App; readonly control: ComparisonControl; readonly internals: AppInternals } {
  const root = document.getElementById("root");
  if (root === null) throw new Error("Missing test root");
  const app = new App(
    root,
    location.origin,
    "/tmp/compare.univer",
    null,
    null,
    "trunk",
    null,
    "standalone",
  );
  apps.push(app);
  const control: ComparisonControl = {
    createUnitComparison: vi.fn(),
    getUnitComparison: vi.fn(),
    getUnitComparisonContext: vi.fn().mockResolvedValue(unitComparisonContext()),
  };
  const internals = app as unknown as AppInternals;
  internals.control = control;
  internals.view = { kind: "worktree", worktreeId };
  internals.comparisonMode = true;
  return { app, control, internals };
}

function unitComparisonContext(): UnitComparisonContextResponse {
  return {
    error: { code: 1, message: "" },
    context: {
      schemaVersion: 1,
      comparisonId: "cmp-current",
      unit: { unitId: "unit-1", type: 2, name: "Sheet", presence: "paired" },
      fidelity: "history",
      stale: false,
      detail: "full",
      summary: { total: 0, insert: 0, delete: 0, update: 0, moved: 0, byEntityType: {} },
      coverage: { supportedEntityTypes: [] },
      page: { offset: 0, limit: 1000, matched: 0, hasMore: false },
      items: [],
      diagnostics: { readiness: "ready", unsupportedMutationIds: [], notes: [] },
      productContext: { kind: "sheet", sheets: [] },
    },
  };
}

function comparisonSession(
  comparisonId: string,
  rightWorktreeId: string,
  left: UnitComparisonRefRequest,
  withUnit = false,
): CreateUnitComparisonResponse {
  const leftRef =
    left.kind === "trunk"
      ? ({ kind: "trunk", label: "Trunk", heads: {} } as const)
      : ({
          kind: "worktree",
          worktreeId: left.worktreeId,
          label: left.worktreeId,
          heads: {},
        } as const);
  return {
    error: { code: 1, message: "" },
    comparisonId,
    createdAt: "2026-08-30T00:00:00.000Z",
    left: leftRef,
    right: {
      kind: "worktree",
      worktreeId: rightWorktreeId,
      label: rightWorktreeId,
      heads: {},
    },
    units: withUnit
      ? [{ unitId: "unit-1", type: 2, name: "Sheet", presence: "paired" }]
      : [],
  };
}

function unitComparison(comparisonId: string): UnitComparisonResponse {
  return {
    error: { code: 1, message: "" },
    comparisonId,
    unit: { unitId: "unit-1", type: 2, name: "Sheet", presence: "paired" },
    fidelity: "history",
    left: { present: false },
    right: { present: false },
    leftChangesets: [],
    rightChangesets: [],
    stale: false,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
