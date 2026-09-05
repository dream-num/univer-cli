import type { ReactElement } from "react";
import { t } from "../i18n";
import type { App, AppSnapshot } from "./app";
import { toast } from "./modals";
import { WorktreeHeader } from "./worktree-header";
import { buildWorktreeHeaderModel } from "./worktree-header/model";

/** Application boundary: select facts and bind commands to the active Worktree. */
export function WorktreeHeaderConnector({
  app,
  snap,
  worktreeId
}: {
  app: App;
  snap: AppSnapshot;
  worktreeId: string;
}): ReactElement {
  const worktree = snap.worktrees.find((item) => item.worktreeId === worktreeId);
  const unit = app.topbarUnits().find((item) => item.unitId === snap.selectedUnitId);
  const preview = snap.previews.get(worktreeId);
  const model = buildWorktreeHeaderModel(
    {
      unitId: unit?.unitId,
      unitName: unit?.name,
      worktreeStatus: worktree?.status,
      unitType: unit?.type,
      changeTag: worktree && unit ? app.unitBadgeInfo(worktree, unit) : undefined,
      preview: preview && {
        diverged: preview.diverged,
        mergeable: preview.mergeable,
        conflictCount: preview.conflicts?.length ?? 0
      },
      previewError: snap.previewErrors.get(worktreeId),
      comparisonMode: snap.comparisonMode,
      comparisonStale: snap.comparisonData?.response.stale ?? false,
      viewPreview: snap.viewPreview,
      sidebarCollapsed: snap.sidebarCollapsed
    },
    t().topbar
  );

  return (
    <WorktreeHeader
      model={model}
      onViewModeChange={(mode) => void app.setComparisonMode(mode === "diff")}
      onPreviewSourceChange={(source) => app.setViewPreview(source === "preview")}
      onRefreshComparison={() => void app.refreshUnitComparison()}
      onDiscard={() => void app.doDiscard(worktreeId)}
      onPrimaryAction={() => {
        if (model.primaryAction?.kind === "submit") {
          void app.doReady(worktreeId);
        } else if (model.primaryAction?.kind === "merge") {
          if (model.primaryAction.disabled) {
            toast(t().toast.conflictsCannotMerge);
            return;
          }
          void app.doMerge(worktreeId);
        }
      }}
    />
  );
}
