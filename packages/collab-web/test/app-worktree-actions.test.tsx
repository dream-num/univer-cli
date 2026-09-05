import type { UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang, t } from "../src/i18n";
import { AppView } from "../src/ui/app-view";
import type { App, AppSnapshot } from "../src/ui/app";
import { Topbar } from "../src/ui/topbar";
import { WorktreeHeader } from "../src/ui/worktree-header";

const unit: UnitSummary = {
  unitId: "unit-1",
  type: 2,
  name: "Demo Sheet",
  headRev: 1
};

describe("collab-web worktree actions", () => {
  let root: Root | undefined;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
  });

  afterEach(() => {
    root?.unmount();
    root = undefined;
    document.body.innerHTML = "";
  });

  it("offers submit and discard without merge while a worktree is still draft", () => {
    const { app, discard, ready } = createApp("draft");
    render(app);

    expect(topbarButton("Merge into current version")).toBeUndefined();
    topbarButton("Submit for confirmation")?.click();
    topbarButton("Discard")?.click();
    expect(ready).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("keeps merge and discard available once a worktree is ready", () => {
    const { app, discard, merge } = createApp("ready");
    render(app);

    expect(topbarButton("Submit for confirmation")).toBeUndefined();
    topbarButton("Merge into current version")?.click();
    topbarButton("Discard")?.click();
    expect(merge).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("keeps comparison and preview toggles independent and badges beside the title", () => {
    const { app, snapshot, compare, viewPreview } = createApp("ready");
    snapshot.previews.set("wt-1", {
      worktreeId: "wt-1",
      mergeable: true,
      diverged: true,
      units: [],
      conflicts: []
    });
    snapshot.viewPreview = true;
    render(app);
    const title = document.querySelector('[data-testid="worktree-title"]');
    expect(title?.textContent).not.toContain(unit.name);
    const name = title?.querySelector("[data-header-name]");
    expect(name?.nextElementSibling?.getAttribute("data-slot")).toBe("change-tag");
    expect(name?.getAttribute("title")).toBe("Demo changes");
    expect(title?.querySelector("[data-header-status-full]")?.textContent).toContain(
      "showing the merged result"
    );
    expect(title?.querySelector("[data-header-status-short]")?.textContent).toBe(
      "Latest version changed"
    );
    topbarButton("Compare")?.click();
    topbarButton("Original edits")?.click();
    expect(compare).toHaveBeenCalledWith(true);
    expect(viewPreview).toHaveBeenCalledWith(false);
    expect(document.querySelector(".topbar select")).toBeNull();
  });

  it("keeps conflict details visible and prevents merge while preserving discard", () => {
    const { app, snapshot, merge, discard } = createApp("ready");
    snapshot.previews.set("wt-1", {
      worktreeId: "wt-1",
      mergeable: false,
      diverged: true,
      units: [],
      conflicts: ["unit-1"]
    });
    render(app);
    expect(topbarButton("Merge into current version")?.disabled).toBe(true);
    expect(document.querySelector("[data-header-status-full]")?.textContent).toContain(
      "1 conflict"
    );
    expect(document.querySelector("[data-header-status-short]")).toBeNull();
    topbarButton("Merge into current version")?.click();
    topbarButton("Discard")?.click();
    expect(merge).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("updates full preview context and title tooltip on re-render", () => {
    const { app, snapshot } = createApp("ready");
    snapshot.previews.set("wt-1", {
      worktreeId: "wt-1",
      mergeable: true,
      diverged: true,
      units: [],
      conflicts: []
    });
    render(app);
    expect(document.querySelector("[data-header-status-full]")?.textContent).toContain(
      "original edits"
    );
    snapshot.viewPreview = true;
    snapshot.worktrees[0]!.name = "A".repeat(300);
    render(app);
    expect(document.querySelector("[data-header-status-full]")?.textContent).toContain(
      "merged result"
    );
    expect(document.querySelector("[data-header-name]")?.getAttribute("title")).toBe(
      "A".repeat(300)
    );
  });

  it("renders and emits events using only display data, without an App or snapshot", () => {
    const merge = vi.fn();
    const compare = vi.fn();
    const source = vi.fn();
    root = createRoot(document.getElementById("root")!);
    flushSync(() =>
      root?.render(
        <WorktreeHeader
          model={{
            title: "Independent Header",
            unitType: 2,
            viewMode: "view",
            previewSource: "preview",
            primaryAction: { kind: "merge", disabled: false },
            canDiscard: true,
            canRefreshComparison: false,
            reserveSidebarToggle: true
          }}
          onPrimaryAction={merge}
          onViewModeChange={compare}
          onPreviewSourceChange={source}
          onDiscard={vi.fn()}
          onRefreshComparison={vi.fn()}
        />
      )
    );
    const header = document.querySelector("header")!;
    expect(header.querySelector("[data-header-name]")?.textContent).toBe("Independent Header");
    expect(header.dataset.headerLayout).toBe("flow");
    expect(header.querySelector(".sidebar-toggle-spacer")).not.toBeNull();
    topbarButton("Merge into current version")?.click();
    topbarButton("Compare")?.click();
    topbarButton("Original edits")?.click();
    expect(merge).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith("diff");
    expect(source).toHaveBeenCalledWith("original");
  });

  it("binds presentation and commands to the selected Worktree", () => {
    const { app, snapshot, ready, discard, merge } = createApp("ready");
    snapshot.worktrees.push({
      ...snapshot.worktrees[0]!,
      worktreeId: "wt-2",
      name: "Other edits",
      status: "draft"
    });
    snapshot.view = { kind: "worktree", worktreeId: "wt-2" };
    snapshot.previews.set("wt-1", {
      worktreeId: "wt-1",
      mergeable: false,
      diverged: true,
      units: [],
      conflicts: ["unit-1"]
    });
    render(app);
    expect(document.querySelector("[data-header-name]")?.textContent).toBe("Other edits");
    expect(document.querySelector("[data-header-status]")).toBeNull();
    topbarButton("Submit for confirmation")?.click();
    topbarButton("Discard")?.click();
    expect(ready).toHaveBeenCalledWith("wt-2");
    expect(discard).toHaveBeenCalledWith("wt-2");
    expect(merge).not.toHaveBeenCalled();
  });

  it("routes the stale comparison refresh event through the application connector", () => {
    const { app, snapshot } = createApp("ready");
    const refresh = vi.spyOn(app, "refreshUnitComparison");
    snapshot.comparisonMode = true;
    snapshot.comparisonData = { response: { stale: true } } as AppSnapshot["comparisonData"];
    root = createRoot(document.getElementById("root")!);
    flushSync(() => root?.render(<Topbar app={app} snap={snapshot} />));
    topbarButton(t().topbar.refreshComparison)?.click();
    expect(refresh).toHaveBeenCalledOnce();
    snapshot.comparisonMode = false;
    flushSync(() => root?.render(<Topbar app={app} snap={snapshot} />));
    expect(topbarButton(t().topbar.refreshComparison)).toBeUndefined();
  });

  it("switches between current-version and Worktree headers without retaining layout state", () => {
    const { app, snapshot } = createApp("ready");
    root = createRoot(document.getElementById("root")!);
    const renderTopbar = (): void => {
      flushSync(() => root?.render(<Topbar app={app} snap={snapshot} />));
    };
    renderTopbar();
    expect(document.querySelector("[data-header-title]")).not.toBeNull();
    snapshot.view = { kind: "trunk" };
    renderTopbar();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    expect(document.querySelector("[data-header-title]")).toBeNull();
    expect(document.querySelector("header")?.hasAttribute("data-header-layout")).toBe(false);
    expect(topbarButton("Merge into current version")).toBeUndefined();
    snapshot.view = { kind: "worktree", worktreeId: "wt-1" };
    renderTopbar();
    expect(document.querySelectorAll("header")).toHaveLength(1);
    expect(document.querySelector("[data-header-name]")?.textContent).toBe("Demo changes");
    expect(topbarButton("Merge into current version")).toBeDefined();
  });

  function render(app: App): void {
    const host = document.getElementById("root");
    if (host === null) {
      throw new Error("Missing test root");
    }
    root ??= createRoot(host);
    flushSync(() => root?.render(<AppView app={app} />));
  }
});

function createApp(status: "draft" | "ready"): {
  app: App;
  discard: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  ready: ReturnType<typeof vi.fn>;
  snapshot: AppSnapshot;
  compare: ReturnType<typeof vi.fn>;
  viewPreview: ReturnType<typeof vi.fn>;
} {
  const discard = vi.fn();
  const merge = vi.fn();
  const ready = vi.fn();
  const compare = vi.fn();
  const viewPreview = vi.fn();
  const worktree: Worktree = {
    worktreeId: "wt-1",
    status,
    agentId: "agent-1",
    name: "Demo changes",
    baseline: {},
    createdAt: new Date().toISOString()
  };
  const snapshot: AppSnapshot = {
    view: { kind: "worktree", worktreeId: worktree.worktreeId },
    selectedUnitId: unit.unitId,
    trunkUnits: [],
    worktreeUnits: [unit],
    worktrees: [worktree],
    previews: new Map(),
    previewErrors: new Map(),
    comparisonMode: false,
    comparisonLeft: { kind: "trunk" },
    comparisonSession: undefined,
    comparisonData: undefined,
    comparisonError: undefined,
    viewPreview: false,
    trunkEditingOptIn: false,
    flashWorktreeId: undefined,
    busy: false,
    lang: "en-US",
    languageLoading: undefined,
    languageError: false,
    appearance: "light",
    sidebarCollapsed: false
  };
  const app = {
    mode: "standalone",
    univerfileName: "demo",
    univerfilePath: "/tmp/demo.univer",
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    bindContent: () => undefined,
    setSidebarCollapsed: () => undefined,
    enterWorktree: () => Promise.resolve(),
    selectWorktreeUnit: () => Promise.resolve(),
    worktreeDeletedUnits: () => [],
    worktreeChangeSummary: () => ({ modified: 0, added: 1, deleted: 0 }),
    unitBadgeInfo: () => ({ variant: "added", text: "A" }),
    setComparisonMode: compare,
    setViewPreview: viewPreview,
    refreshUnitComparison: vi.fn(),
    topbarUnits: () => [unit],
    pendingWorktreeCount: () => 0,
    doReady: ready,
    doMerge: merge,
    doDiscard: discard,
    chooseAppearance: () => undefined,
    chooseLang: () => Promise.resolve()
  } as unknown as App;
  return { app, snapshot, discard, merge, ready, compare, viewPreview };
}

function topbarButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".topbar button")].find(
    (button) => button.textContent?.trim() === label
  );
}
