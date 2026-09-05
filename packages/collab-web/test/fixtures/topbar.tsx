/** Dev-only fixture: renders the production Header with inert application actions. */
import { useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { LOCALE_MANIFEST, setLang, t, type Lang } from "../../src/i18n";
import type { App, AppSnapshot } from "../../src/ui/app";
import { Topbar } from "../../src/ui/topbar";
import "../../src/styles.css";

const unit: UnitSummary = { unitId: "unit-1", name: "Worktree Only Document", type: 1, headRev: 1 };
const names = {
  short: "预算",
  normal: "all-unit-comparison-changes",
  chinese: "集团年度预算与跨部门协作数据汇总及多轮审批修订记录".repeat(10) + ".xlsx",
  english:
    "AnnualBudgetAndCrossDepartmentCollaborationReviewWithHistoricalRevisionsAndSupplementaryNotes".repeat(
      4
    ) + ".xlsx"
};

function HeaderFixture(): ReactElement {
  const [width, setWidth] = useState(1130);
  const [scenario, setScenario] = useState("ready");
  const [language, setLanguage] = useState<Lang>("zh-CN");
  const [name, setName] = useState<string>(names.normal);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [viewPreview, setViewPreview] = useState(true);
  const [action, setAction] = useState("");
  const worktree: Worktree = {
    worktreeId: "wt-1",
    name,
    agentId: "test",
    status: scenario === "draft" ? "draft" : scenario === "merged" ? "merged" : "ready",
    baseline: {},
    createdAt: "2026-09-05T00:00:00Z"
  };
  const diverged = ["preview", "conflict", "stale"].includes(scenario);
  const snap: AppSnapshot = {
    view: scenario === "trunk" ? { kind: "trunk" } : { kind: "worktree", worktreeId: "wt-1" },
    selectedUnitId: unit.unitId,
    trunkUnits: [unit],
    worktreeUnits: [unit],
    worktrees: [worktree],
    previews: diverged
      ? new Map([
          [
            "wt-1",
            {
              worktreeId: "wt-1",
              diverged: true,
              mergeable: scenario !== "conflict",
              units: [],
              conflicts: scenario === "conflict" ? [unit.unitId] : []
            }
          ]
        ])
      : new Map(),
    previewErrors:
      scenario === "error" ? new Map([["wt-1", "Preview unavailable for this test"]]) : new Map(),
    comparisonMode: scenario === "stale" || comparisonMode,
    comparisonLeft: { kind: "trunk" },
    comparisonSession: undefined,
    comparisonData:
      scenario === "stale"
        ? ({ response: { stale: true } } as AppSnapshot["comparisonData"])
        : undefined,
    comparisonError: undefined,
    viewPreview,
    trunkEditingOptIn: false,
    flashWorktreeId: undefined,
    busy: false,
    lang: language,
    languageLoading: undefined,
    languageError: false,
    appearance: dark ? "dark" : "light",
    sidebarCollapsed: collapsed
  };
  const app = {
    univerfileName: "Header test",
    topbarUnits: () => [unit],
    pendingWorktreeCount: () => 0,
    unitBadgeInfo: () =>
      scenario === "no-badge" ? undefined : { variant: "added", text: t().change.added },
    setComparisonMode: (value: boolean) => {
      setComparisonMode(value);
      setAction(`compare:${value}`);
    },
    setViewPreview: (value: boolean) => {
      setViewPreview(value);
      setAction(`preview:${value}`);
    },
    doReady: () => setAction("submit"),
    doMerge: () => setAction("merge"),
    doDiscard: () => setAction("discard"),
    refreshUnitComparison: () => setAction("refresh")
  } as unknown as App;
  return (
    <div data-fixture-locale={language} style={{ height: "100%", overflow: "auto" }}>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 16, alignItems: "center" }}
      >
        <label>
          Frame width{" "}
          <input
            aria-label="Frame width"
            type="number"
            min="480"
            max="1920"
            value={width}
            onChange={(e) => setWidth(Math.max(480, Number(e.target.value)))}
            style={{ width: 80 }}
          />
        </label>
        <label>
          State{" "}
          <select aria-label="State" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {[
              "ready",
              "preview",
              "draft",
              "conflict",
              "error",
              "stale",
              "merged",
              "no-badge",
              "trunk"
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Language{" "}
          <select
            aria-label="Language"
            value={language}
            onChange={(e) => {
              const lang = e.target.value as Lang;
              void setLang(lang).then(() => setLanguage(lang));
            }}
          >
            {LOCALE_MANIFEST.map((l) => (
              <option key={l.tag} value={l.tag}>
                {l.tag}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name preset{" "}
          <select
            aria-label="Name preset"
            defaultValue="normal"
            onChange={(e) => setName(names[e.target.value as keyof typeof names])}
          >
            {Object.keys(names).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Title <input aria-label="Title" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={collapsed}
            onChange={(e) => setCollapsed(e.target.checked)}
          />
          Sidebar collapsed
        </label>
        <label>
          <input
            type="checkbox"
            checked={dark}
            onChange={(e) => {
              setDark(e.target.checked);
              document.documentElement.classList.toggle("gateway-dark", e.target.checked);
            }}
          />
          Dark
        </label>
        <output aria-label="Last action">{action}</output>
      </div>
      <div
        data-testid="fixture-frame"
        style={{
          display: "flex",
          width,
          minHeight: 520,
          border: "1px solid #ddd",
          margin: "16px auto"
        }}
      >
        {!collapsed && (
          <aside
            style={{
              flex: "0 0 256px",
              padding: 16,
              background: "var(--color-sidebar)",
              borderRight: "1px solid #ddd"
            }}
          >
            Sidebar · 256px
          </aside>
        )}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <Topbar app={app} snap={snap} />
          <p style={{ padding: 24 }}>Production Topbar · isolated layout fixture</p>
        </main>
      </div>
    </div>
  );
}

await setLang("zh-CN");
const root = createRoot(document.getElementById("app")!);
root.render(<HeaderFixture />);
import.meta.hot?.dispose(() => root.unmount());
