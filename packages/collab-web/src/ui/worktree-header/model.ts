import type { WorktreeStatus } from "@univer/collab-gateway-contract";
import type { ChangeTagProps } from "../../components/ui/change-tag";
import type { Messages } from "../../i18n/locales/en-US";

export type HeaderViewMode = "view" | "diff";
export type HeaderPreviewSource = "preview" | "original";

export interface WorktreeHeaderModel {
  title: string;
  unitType: number;
  changeTag?: { variant: NonNullable<ChangeTagProps["variant"]>; text: string } | undefined;
  status?:
    | {
        text: string;
        tooltip: string;
        tone: "info" | "warn" | "danger";
      }
    | undefined;
  viewMode: HeaderViewMode;
  previewSource?: HeaderPreviewSource | undefined;
  primaryAction?: { kind: "submit" } | { kind: "merge"; disabled: boolean } | undefined;
  canDiscard: boolean;
  canRefreshComparison: boolean;
  reserveSidebarToggle: boolean;
}

export interface WorktreeHeaderEvents {
  onViewModeChange: (mode: HeaderViewMode) => void;
  onPreviewSourceChange: (source: HeaderPreviewSource) => void;
  onPrimaryAction: () => void;
  onDiscard: () => void;
  onRefreshComparison: () => void;
}

export interface WorktreeHeaderInput {
  unitId?: string | undefined;
  unitName?: string | undefined;
  worktreeStatus?: WorktreeStatus | undefined;
  unitType?: number | undefined;
  changeTag?: WorktreeHeaderModel["changeTag"];
  preview?: { diverged: boolean; mergeable: boolean; conflictCount: number } | undefined;
  previewError?: string | undefined;
  comparisonMode: boolean;
  comparisonStale: boolean;
  viewPreview: boolean;
  sidebarCollapsed: boolean;
}

/** Convert selected business facts into display data; no App, DOM, or side effects. */
export function buildWorktreeHeaderModel(
  input: WorktreeHeaderInput,
  messages: Messages["topbar"]
): WorktreeHeaderModel {
  const { preview } = input;
  let status: WorktreeHeaderModel["status"];
  if (input.previewError !== undefined) {
    status = { text: messages.previewUnavailable, tooltip: input.previewError, tone: "warn" };
  } else if (preview?.diverged) {
    if (preview.mergeable) {
      const text = input.viewPreview
        ? messages.divergedShowingPreview
        : messages.divergedShowingOriginal;
      status = { text, tooltip: text, tone: "info" };
    } else {
      const text = messages.conflictCount(preview.conflictCount);
      status = { text, tooltip: text, tone: "danger" };
    }
  }
  const primaryAction: WorktreeHeaderModel["primaryAction"] =
    input.worktreeStatus === "draft"
      ? { kind: "submit" }
      : input.worktreeStatus === "ready"
        ? { kind: "merge", disabled: preview !== undefined && !preview.mergeable }
        : undefined;

  return {
    title: input.unitName || input.unitId || messages.fallbackDocumentName,
    unitType: input.unitType ?? 2,
    changeTag: input.changeTag,
    status,
    viewMode: input.comparisonMode ? "diff" : "view",
    previewSource: preview?.diverged ? (input.viewPreview ? "preview" : "original") : undefined,
    primaryAction,
    canDiscard: input.worktreeStatus === "draft" || input.worktreeStatus === "ready",
    canRefreshComparison: input.comparisonMode && input.comparisonStale,
    reserveSidebarToggle: input.sidebarCollapsed
  };
}
