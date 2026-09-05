// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEnUsMessages } from "../src/i18n/locales/en-US";
import { createZhCnMessages } from "../src/i18n/locales/zh-CN";
import {
  buildWorktreeHeaderModel,
  type WorktreeHeaderInput
} from "../src/ui/worktree-header/model";

const messages = createEnUsMessages().topbar;
const ready: WorktreeHeaderInput = {
  worktreeId: "wt-1",
  name: "Budget changes",
  worktreeStatus: "ready",
  comparisonMode: false,
  comparisonStale: false,
  viewPreview: true,
  sidebarCollapsed: false
};

describe("Worktree Header presentation model", () => {
  it("offers exactly the primary action appropriate to the lifecycle", () => {
    expect(buildWorktreeHeaderModel({ ...ready, worktreeStatus: "draft" }, messages)).toMatchObject(
      {
        primaryAction: { kind: "submit" },
        canDiscard: true
      }
    );
    expect(buildWorktreeHeaderModel(ready, messages)).toMatchObject({
      primaryAction: { kind: "merge", disabled: false },
      canDiscard: true
    });
    for (const worktreeStatus of ["merged", undefined] as const) {
      expect(buildWorktreeHeaderModel({ ...ready, worktreeStatus }, messages)).toMatchObject({
        primaryAction: undefined,
        canDiscard: false
      });
    }
  });

  it("keeps preview-source selection and meaningful version-change context independent of comparison", () => {
    const input = { ...ready, preview: { diverged: true, mergeable: true, conflictCount: 0 } };
    expect(buildWorktreeHeaderModel(input, messages)).toMatchObject({
      viewMode: "view",
      previewSource: "preview",
      status: {
        text: messages.divergedShowingPreview,
        tone: "info"
      }
    });
    expect(
      buildWorktreeHeaderModel({ ...input, viewPreview: false, comparisonMode: true }, messages)
    ).toMatchObject({
      viewMode: "diff",
      previewSource: "original",
      status: { text: messages.divergedShowingOriginal }
    });
    expect(buildWorktreeHeaderModel(input, createZhCnMessages().topbar).status?.text).toBe(
      "最新版本已变化 · 正在显示合并结果"
    );
  });

  it("preserves conflict details and disables merge without hiding discard", () => {
    const model = buildWorktreeHeaderModel(
      {
        ...ready,
        preview: { diverged: true, mergeable: false, conflictCount: 2 }
      },
      messages
    );
    expect(model).toMatchObject({
      primaryAction: { kind: "merge", disabled: true },
      canDiscard: true,
      status: { text: messages.conflictCount(2), tone: "danger" }
    });
  });

  it("prioritizes preview errors without losing their details or inventing a conflict", () => {
    const model = buildWorktreeHeaderModel(
      {
        ...ready,
        previewError: "Preview request failed",
        preview: { diverged: true, mergeable: true, conflictCount: 0 }
      },
      messages
    );
    expect(model.status).toEqual({
      text: messages.previewUnavailable,
      tooltip: "Preview request failed",
      tone: "warn"
    });
    expect(model.primaryAction).toEqual({ kind: "merge", disabled: false });
    expect(model.previewSource).toBe("preview");
  });

  it("only offers refresh for a stale active comparison and hides an unnecessary preview toggle", () => {
    expect(
      buildWorktreeHeaderModel({ ...ready, comparisonStale: true }, messages).canRefreshComparison
    ).toBe(false);
    const model = buildWorktreeHeaderModel(
      {
        ...ready,
        comparisonStale: true,
        comparisonMode: true,
        preview: { diverged: false, mergeable: true, conflictCount: 0 }
      },
      messages
    );
    expect(model.canRefreshComparison).toBe(true);
    expect(model.previewSource).toBeUndefined();
    expect(model.status).toBeUndefined();
  });

  it("preserves explicit title/icon/badge data and provides title fallbacks without mutation", () => {
    const input = Object.freeze({
      ...ready,
      unitType: 1,
      changeTag: { variant: "added" as const, text: "New" },
      sidebarCollapsed: true
    });
    expect(buildWorktreeHeaderModel(input, messages)).toMatchObject({
      title: "Budget changes",
      unitType: 1,
      changeTag: { variant: "added", text: "New" },
      reserveSidebarToggle: true
    });
    expect(buildWorktreeHeaderModel({ ...ready, name: "" }, messages).title).toBe("wt-1");
    expect(buildWorktreeHeaderModel({ ...ready, name: "", worktreeId: "" }, messages).title).toBe(
      messages.fallbackWorktreeName
    );
  });
});
