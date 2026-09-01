import type { CreateUnitComparisonResponse, UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { UniverInstanceType } from "@univerjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../src/core/viewer";
import { setLang } from "../src/i18n";
import { App } from "../src/ui/app";

vi.mock("../src/core/events", () => ({
  openEventChannel: () => ({ close: () => undefined }),
}));

vi.mock("../src/ui/workbook-diff-viewer", () => ({
  WorkbookDiffViewer: () => "Comparison preview",
}));

vi.mock("../src/core/viewer", () => ({
  createPreviewViewer: vi.fn(),
  decodeComparisonUnitData: vi.fn(async (_type: number, snapshot: unknown) => snapshot),
  createViewer: vi.fn(async ({ container }: { container: string }) => {
    // Like the SDK, resolve the host when creation starts, before async initialization.
    const host = document.getElementById(container);
    if (host === null) throw new Error("Viewer host is detached");
    await Promise.resolve();
    const canvas = document.createElement("canvas");
    host.append(canvas);
    return {
      setDarkMode: () => undefined,
      setLocale: async () => undefined,
      dispose: () => canvas.remove(),
    };
  }),
}));

const unit: UnitSummary = {
  unitId: "unit-1", type: UniverInstanceType.UNIVER_SHEET, name: "Demo Sheet", headRev: 1,
};
const worktree: Worktree = {
  worktreeId: "wt-1", name: "Review changes", status: "draft", agentId: "agent", baseline: {},
  createdAt: "2026-08-31T00:00:00.000Z",
};
const session: CreateUnitComparisonResponse = {
  error: { code: 1, message: "" }, comparisonId: "cmp-1", createdAt: worktree.createdAt,
  left: { kind: "trunk", label: "Trunk", heads: {} },
  right: { kind: "worktree", worktreeId: worktree.worktreeId, label: worktree.name, heads: {} },
  units: [{ ...unit, presence: "paired" }],
};

describe("viewer host lifecycle when leaving comparison", () => {
  let app: App | undefined;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
    history.replaceState(null, "", "/");
    vi.mocked(createViewer).mockClear();
  });

  afterEach(() => {
    app?.dispose();
    app = undefined;
    document.body.innerHTML = "";
  });

  async function start(): Promise<ReturnType<typeof vi.fn>> {
    const root = document.getElementById("root")!;
    app = new App(root, location.origin, "/tmp/lifecycle.univer", worktree.worktreeId, unit.unitId, "worktree", null, "standalone");
    const createUnitComparison = vi.fn().mockResolvedValue(session);
    Object.assign(app, {
      control: {
        listUnits: async () => [unit],
        listWorktrees: async () => [worktree],
        previewMerge: async () => ({ error: { code: 1, message: "" }, diverged: false, units: [] }),
        createUnitComparison,
        getUnitComparison: async () => ({
          error: { code: 1, message: "" }, comparisonId: session.comparisonId,
          unit: session.units[0], fidelity: "history", stale: false,
          left: { present: false }, right: { present: false }, leftChangesets: [], rightChangesets: [],
        }),
        getUnitComparisonContext: async () => ({
          error: { code: 1, message: "" },
          context: {
            schemaVersion: 1, comparisonId: session.comparisonId, unit: session.units[0],
            fidelity: "history", stale: false, detail: "full",
            summary: { total: 0, insert: 0, delete: 0, update: 0, moved: 0, byEntityType: {} },
            coverage: { supportedEntityTypes: [] },
            page: { offset: 0, limit: 1000, matched: 0, hasMore: false }, items: [],
            diagnostics: { readiness: "ready", unsupportedMutationIds: [], codes: [] },
            productContext: { kind: "sheet", sheets: [] },
          },
        }),
      },
    });
    await app.start();
    await vi.waitFor(() => expect(document.querySelector(".content canvas")).not.toBeNull());
    return createUnitComparison;
  }

  it("mounts each fresh viewer into the visible host across repeated Compare → View clicks", async () => {
    await start();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      clickMode("Compare");
      await vi.waitFor(() => expect(document.body.textContent).toContain("Comparison preview"));
      expect(document.querySelector(".content")).toBeNull();
      clickMode("View");
      await expectVisibleViewer(cycle + 2);
    }
  });

  it("mounts the trunk viewer when leaving comparison via the file sidebar", async () => {
    await start();
    clickMode("Compare");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Comparison preview"));
    const trunkUnit = [...document.querySelectorAll<HTMLButtonElement>(".sidebar button")]
      .find((button) => button.textContent?.trim() === unit.name);
    expect(trunkUnit).toBeDefined();
    trunkUnit!.click();
    await expectVisibleViewer(2);
    expect(app?.getSnapshot().view.kind).toBe("trunk");
  });

  it("restores View while comparison is loading and ignores the late comparison response", async () => {
    const createUnitComparison = await start();
    let finish!: (value: CreateUnitComparisonResponse) => void;
    createUnitComparison.mockReturnValueOnce(new Promise<CreateUnitComparisonResponse>((resolve) => { finish = resolve; }));
    clickMode("Compare");
    await vi.waitFor(() => expect(document.querySelector(".content")).toBeNull());
    clickMode("View");
    await expectVisibleViewer(2);
    finish(session);
    await vi.waitFor(() => expect(app?.getSnapshot().busy).toBe(false));
    expect(app?.getSnapshot().comparisonMode).toBe(false);
    expect(document.querySelector(".content canvas")).not.toBeNull();
  });
});

function clickMode(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>("[data-testid=view-diff-center] button")]
    .find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  button!.click();
}

async function expectVisibleViewer(callCount: number): Promise<void> {
  await vi.waitFor(() => expect(createViewer).toHaveBeenCalledTimes(callCount));
  const options = vi.mocked(createViewer).mock.calls.at(-1)![0];
  expect(document.getElementById(options.container)?.isConnected).toBe(true);
  await vi.waitFor(() => expect(document.querySelector(".content canvas")).not.toBeNull());
}
