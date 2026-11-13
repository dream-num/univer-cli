// @vitest-environment jsdom
import type { MergeResponse, UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventChannelHandlers } from "../src/core/events";
import { setLang } from "../src/i18n";
import { App } from "../src/ui/app";

const mockState = vi.hoisted(() => ({
  merge: vi.fn<() => Promise<MergeResponse>>(),
  createViewer: vi.fn(),
  trunkUnits: [] as UnitSummary[],
  worktreeUnits: [] as UnitSummary[],
  worktree: undefined as Worktree | undefined,
  events: undefined as EventChannelHandlers | undefined,
}));

vi.mock("@univer/collab-gateway-contract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@univer/collab-gateway-contract")>()),
  WorktreeControlClient: class {
    public listUnits(worktreeId?: string): Promise<UnitSummary[]> {
      return Promise.resolve(
        [...(worktreeId === undefined ? mockState.trunkUnits : mockState.worktreeUnits)],
      );
    }

    public listWorktrees(): Promise<Worktree[]> {
      return Promise.resolve(mockState.worktree === undefined ? [] : [mockState.worktree]);
    }

    public previewMerge(): Promise<unknown> {
      return Promise.resolve({
        error: { code: 1, message: "" },
        diverged: false,
        mergeable: true,
        conflicts: [],
        units: [],
      });
    }

    public merge(): Promise<MergeResponse> {
      return mockState.merge();
    }
  },
}));

vi.mock("../src/core/events", () => ({
  openEventChannel: (url: string, handlers: EventChannelHandlers) => {
    if (!url.includes("/worktrees/")) mockState.events = handlers;
    return { close: () => undefined };
  },
}));

vi.mock("../src/core/locales/generated/load", () => ({
  loadViewerLocale: () => Promise.resolve({}),
}));

vi.mock("../src/core/viewer", () => ({
  createViewer: (options: unknown) => mockState.createViewer(options),
}));

vi.mock("../src/ui/dialogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ui/dialogs")>()),
  confirmDialog: () => Promise.resolve(true),
}));

const firstUnit: UnitSummary = {
  unitId: "univer-introduction",
  type: 1,
  name: "Univer introduction",
  headRev: 1,
};
const selectedUnit: UnitSummary = {
  ...firstUnit,
  unitId: "univer-introduction-complete",
  headRev: 2,
};
const mergeResponse: MergeResponse = {
  error: { code: 1, message: "" },
  ok: true,
  mergedRevs: { [firstUnit.unitId]: 1, [selectedUnit.unitId]: 2 },
};

describe("returning from a worktree keeps the reviewed document selected", () => {
  let app: App | undefined;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
    mockState.events = undefined;
    mockState.trunkUnits = [firstUnit, selectedUnit];
    mockState.worktreeUnits = [firstUnit, selectedUnit];
    mockState.worktree = {
      worktreeId: "wt-1",
      status: "ready",
      agentId: "agent",
      name: "Review the complete introduction",
      baseline: { [firstUnit.unitId]: 1, [selectedUnit.unitId]: 1 },
      createdAt: "2026-10-24T00:00:00.000Z",
    };
    mockState.merge.mockReset().mockImplementation(async () => {
      mockState.worktree = { ...mockState.worktree!, status: "merged" };
      return mergeResponse;
    });
    mockState.createViewer.mockReset().mockResolvedValue({
      setDarkMode: () => undefined,
      setLocale: () => Promise.resolve(),
      dispose: () => undefined,
    });
  });

  afterEach(() => {
    app?.dispose();
    app = undefined;
    document.body.innerHTML = "";
  });

  it("keeps the second same-name document after the merge response", async () => {
    await startApp();

    await app!.doMerge("wt-1");

    await expectTrunkSelection(selectedUnit.unitId);
  });

  it("keeps selection when the merge lifecycle event arrives before the response", async () => {
    let finishMerge: ((response: MergeResponse) => void) | undefined;
    mockState.merge.mockImplementation(
      () => new Promise((resolve) => { finishMerge = resolve; }),
    );
    await startApp();

    const merge = app!.doMerge("wt-1");
    await vi.waitFor(() => expect(mockState.merge).toHaveBeenCalledOnce());
    terminalEvent("merged");
    await expectTrunkSelection(selectedUnit.unitId);
    finishMerge!(mergeResponse);
    await merge;

    await expectTrunkSelection(selectedUnit.unitId);
  });

  it.each(["merged", "discarded"] as const)(
    "keeps the selected document when the worktree is %s elsewhere",
    async (status) => {
      await startApp();

      terminalEvent(status);

      await expectTrunkSelection(selectedUnit.unitId);
    },
  );

  it("falls back when the selected document was removed from trunk by the merge", async () => {
    await startApp();

    mockState.trunkUnits = [firstUnit];
    mockState.events!.unit_removed!({ type: "unit_removed", unitId: selectedUnit.unitId });
    terminalEvent("merged");

    await expectTrunkSelection(firstUnit.unitId);
  });

  it("falls back when a discarded worktree's new document does not exist in trunk", async () => {
    mockState.trunkUnits = [firstUnit];
    await startApp();

    terminalEvent("discarded");

    await expectTrunkSelection(firstUnit.unitId);
  });

  it("keeps a newly merged document when unit_added precedes the merged event", async () => {
    mockState.trunkUnits = [firstUnit];
    await startApp();

    mockState.trunkUnits = [firstUnit, selectedUnit];
    mockState.events!.unit_added!({
      type: "unit_added",
      unitId: selectedUnit.unitId,
      unitType: 1,
      name: selectedUnit.name,
    });
    terminalEvent("merged");

    await expectTrunkSelection(selectedUnit.unitId);
  });

  async function startApp(): Promise<void> {
    app = new App(
      document.getElementById("root")!,
      location.origin,
      "/tmp/introduction.univer",
      "wt-1",
      selectedUnit.unitId,
      "worktree",
      null,
      "standalone",
    );
    await app.start();
    expect(app.getSnapshot()).toMatchObject({
      view: { kind: "worktree", worktreeId: "wt-1" },
      selectedUnitId: selectedUnit.unitId,
    });
  }

  function terminalEvent(status: "merged" | "discarded"): void {
    mockState.worktree = { ...mockState.worktree!, status };
    mockState.events!.worktree!({ type: "worktree", worktree: mockState.worktree });
  }

  async function expectTrunkSelection(unitId: string): Promise<void> {
    expect(app!.getSnapshot()).toMatchObject({ view: { kind: "trunk" }, selectedUnitId: unitId });
    expect(new URL(location.href).searchParams.get("unit")).toBe(unitId);
    expect(new URL(location.href).searchParams.has("worktree")).toBe(false);
    await vi.waitFor(() => {
      const options = mockState.createViewer.mock.lastCall?.[0] as Record<string, unknown>;
      expect(options).toMatchObject({ unitId });
      expect(options).not.toHaveProperty("worktreeId");
    });
  }
});
