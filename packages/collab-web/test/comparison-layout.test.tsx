import type { UnitComparisonContext } from "@univer/collab-gateway-contract";
import { LocaleType, UniverInstanceType, type IWorkbookData } from "@univerjs/core";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLang } from "../src/i18n";
import type { App, AppSnapshot } from "../src/ui/app";
import { AppView } from "../src/ui/app-view";
import { formatComparisonValue } from "../src/ui/comparison-value";

const workbookViews = vi.hoisted(() => ({ props: [] as Array<{ showFormulaText?: boolean; snapshot: unknown }> }));
vi.mock("../src/ui/readonly-univer-workbook-view", () => ({
  ReadonlyUniverWorkbookView: (props: { showFormulaText?: boolean; snapshot: unknown }) => {
    workbookViews.props.push(props);
    return <div data-testid="readonly-sheet" data-formulas={String(props.showFormulaText)} />;
  },
}));

describe("comparison layout without step navigation", () => {
  let root: Root | undefined;

  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = '<main id="root"></main>';
    workbookViews.props = [];
  });

  afterEach(() => {
    root?.unmount();
    root = undefined;
    document.body.innerHTML = "";
  });

  it.each([
    ["Sheet", UniverInstanceType.UNIVER_SHEET],
    ["Doc", UniverInstanceType.UNIVER_DOC],
    ["Slide", UniverInstanceType.UNIVER_SLIDE],
    ["Base", UniverInstanceType.UNIVER_BASE],
    ["Board", UniverInstanceType.UNIVER_BOARD],
  ] as const)("keeps %s comparison panes and source selection without the previous/next header", async (_name, type) => {
    const app = comparisonApp(type);
    root = createRoot(document.getElementById("root")!);
    flushSync(() => root?.render(<AppView app={app} />));
    await vi.waitFor(() => expect(document.querySelector("select")).not.toBeNull());
    expect(document.querySelector('[data-testid="comparison-change-navigator"]')).toBeNull();
    expect(document.querySelector("nav")).toBeNull();
    expect(document.body.textContent).toContain("Current edits");
    expect(document.querySelector("aside")).not.toBeNull();
    if (type === UniverInstanceType.UNIVER_SHEET) {
      expect(document.querySelectorAll('[data-testid="readonly-sheet"]')).toHaveLength(2);
      expect(document.querySelector('[data-testid="base-workbook-diff-fx-cell"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="target-workbook-diff-fx-cell"]')).not.toBeNull();
    } else if (type !== UniverInstanceType.UNIVER_BASE) {
      expect(document.querySelectorAll('[data-native-diff-host="true"]')).toHaveLength(2);
    }
    if (type !== UniverInstanceType.UNIVER_SHEET) {
      const panes = document.querySelector(`[data-testid="${type === UniverInstanceType.UNIVER_BASE ? "base" : "native"}-diff-panes"]`)!;
      expect(panes.classList.contains("bg-border")).toBe(true);
      expect(panes.classList.contains("gap-px")).toBe(true);
      expect(panes.classList.contains("max-[1023px]:grid-rows-2")).toBe(true);
    }
  });

  it("places scope in the sidebar header and switches formula display on both panes independently of diff mode", async () => {
    root = createRoot(document.getElementById("root")!);
    flushSync(() => root?.render(<AppView app={comparisonApp(UniverInstanceType.UNIVER_SHEET)} />));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="readonly-sheet"]')).toHaveLength(2));
    const scope = document.querySelector('[aria-label="Comparison scope"]')!;
    expect(scope.closest("aside header")).not.toBeNull();
    expect(scope.classList.contains("w-full")).toBe(true);
    const scopeTabs = [...scope.querySelectorAll('[role="tab"]')];
    expect(scopeTabs.map((tab) => tab.textContent)).toEqual(["Worksheet", "Workbook"]);
    for (const tab of scopeTabs) {
      expect(tab.classList.contains("flex-1")).toBe(true);
      expect(tab.classList.contains("min-w-0")).toBe(true);
      expect(tab.classList.contains("text-center")).toBe(true);
    }
    const displayTabs = document.querySelector('[aria-label="Comparison display mode"]');
    expect(displayTabs).not.toBeNull();
    expect(displayTabs?.classList.contains("w-full")).not.toBe(true);
    const toggle = [...document.querySelectorAll("button")].find((button) => button.textContent === "Show formulas")!;
    for (let cycle = 0; cycle < 3; cycle++) {
      const content = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Content") as HTMLElement;
      flushSync(() => content.click());
      const snapshots = workbookViews.props.slice(-2).map((props) => props.snapshot as IWorkbookData);
      expect(snapshots.map((snapshot) => snapshot.styles)).toEqual([{}, {}]);
      flushSync(() => toggle.click());
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(workbookViews.props.slice(-2).map((props) => props.showFormulaText)).toEqual([true, true]);
      expect(workbookViews.props.slice(-2)[0]?.snapshot).toBe(snapshots[0]);
      expect(workbookViews.props.slice(-2)[1]?.snapshot).toBe(snapshots[1]);
      const formatting = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Formatting") as HTMLElement;
      flushSync(() => formatting.click());
      expect(workbookViews.props.slice(-2).map((props) => props.showFormulaText)).toEqual([true, true]);
      expect(workbookViews.props.slice(-2).map((props) => (props.snapshot as IWorkbookData).styles)).toEqual([
        { heading: { bl: 1 } }, { heading: { bl: 1 } },
      ]);
      flushSync(() => toggle.click());
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(workbookViews.props.slice(-2).map((props) => props.showFormulaText)).toEqual([false, false]);
    }
  });

  it("preserves localized readable sidebar values after removing the navigator", async () => {
    expect(formatComparisonValue({ id: "opaque-id", language: "typescript" })).toBe("2 properties");
    expect(formatComparisonValue('[1,2]', "object")).toBe("2 items");
    expect(formatComparisonValue('[1,2]', "text")).toBe('[1,2]');
    expect(formatComparisonValue({ rgb: "#ff0000" })).toBe("#ff0000");
    expect(formatComparisonValue(undefined)).toBe("∅");
    expect(formatComparisonValue(false, "boolean")).toBe("Unchecked");
    await setLang("zh-CN");
    expect(formatComparisonValue(false, "boolean")).toBe("未勾选");
    expect(formatComparisonValue([1, 2])).toBe("2 项");
  });
});

function comparisonApp(type: UniverInstanceType): App {
  const unit = { unitId: "unit", type, name: "Example", presence: "paired" as const };
  const context: UnitComparisonContext = {
    schemaVersion: 1, comparisonId: "cmp", unit, fidelity: "snapshot", stale: false, detail: "full",
    items: [], summary: { total: 0, insert: 0, delete: 0, update: 0, moved: 0, byEntityType: {} },
    coverage: { supportedEntityTypes: [] }, page: { offset: 0, limit: 1000, matched: 0, hasMore: false },
    diagnostics: { readiness: "ready", unsupportedMutationIds: [], notes: [] },
    productContext: { kind: "sheet", sheets: [] },
  };
  const workbook = { id: "unit", name: "Example", locale: LocaleType.EN_US, appVersion: "1", styles: { heading: { bl: 1 } }, sheets: {}, sheetOrder: [] };
  const snapshot: AppSnapshot = {
    view: { kind: "worktree", worktreeId: "wt" }, selectedUnitId: "unit",
    trunkUnits: [], worktreeUnits: [], worktrees: [], previews: new Map(), previewErrors: new Map(),
    comparisonMode: true, comparisonLeft: { kind: "trunk" }, comparisonError: undefined,
    comparisonSession: {
      error: { code: 1, message: "" }, comparisonId: "cmp", createdAt: "2026-08-31T00:00:00.000Z",
      left: { kind: "trunk", label: "Main", heads: {} },
      right: { kind: "worktree", worktreeId: "wt", label: "Current edits", heads: {} }, units: [unit],
    },
    comparisonData: {
      context, leftUnitData: workbook, rightUnitData: workbook,
      response: {
        error: { code: 1, message: "" }, comparisonId: "cmp", unit, fidelity: "snapshot", stale: false,
        left: { present: true }, right: { present: true }, leftChangesets: [], rightChangesets: [],
      },
    },
    viewPreview: false, trunkEditingOptIn: false, flashWorktreeId: undefined, busy: false,
    lang: "en-US", languageLoading: undefined, languageError: false, appearance: "light", sidebarCollapsed: false,
  };
  return { mode: "embedded", subscribe: () => () => undefined, getSnapshot: () => snapshot } as unknown as App;
}
