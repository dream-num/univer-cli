import type { UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../src/i18n";
import { AppView } from "../src/ui/app-view";
import type { App, AppSnapshot } from "../src/ui/app";

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

  it("gives view and compare a full-width narrow row and a compact wide-screen slot", () => {
    const { app } = createApp("draft");
    render(app);

    const switcher = document.querySelector('[data-testid="view-diff-center"]');
    const compareButton = [...(switcher?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Compare"
    );
    expect(switcher).not.toBeNull();
    expect(switcher?.classList.contains("w-full")).toBe(true);
    expect(switcher?.classList.contains("@min-[1100px]/workbench:w-auto")).toBe(true);
    expect(switcher?.firstElementChild?.classList.contains("h-12")).toBe(true);
    expect(compareButton?.classList.contains("h-11")).toBe(true);
    expect(compareButton?.classList.contains("@min-[1100px]/workbench:h-7")).toBe(true);
    expect(compareButton?.classList.contains("px-5")).toBe(true);
    expect(document.querySelector(".topbar select")).toBeNull();
  });

  function render(app: App): void {
    const host = document.getElementById("root");
    if (host === null) {
      throw new Error("Missing test root");
    }
    root = createRoot(host);
    flushSync(() => root?.render(<AppView app={app} />));
  }
});

function createApp(status: "draft" | "ready"): {
  app: App;
  discard: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  ready: ReturnType<typeof vi.fn>;
} {
  const discard = vi.fn();
  const merge = vi.fn();
  const ready = vi.fn();
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
    unitBadgeInfo: () => undefined,
    topbarUnits: () => [unit],
    doReady: ready,
    doMerge: merge,
    doDiscard: discard,
    chooseAppearance: () => undefined,
    chooseLang: () => Promise.resolve()
  } as unknown as App;
  return { app, discard, merge, ready };
}

function topbarButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".topbar button")].find(
    (button) => button.textContent?.trim() === label
  );
}
