import { CircleCheck, GitMerge, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ChangeTag } from "../../components/ui/change-tag";
import { SegmentedToggle } from "../../components/ui/toggle-group";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import type { App, AppSnapshot } from "../app";
import { toast } from "../modals";
import { TitleUnitIcon } from "../title-unit-icon";
import { useWorktreeHeaderLayout } from "./layout";

export function WorktreeHeader({
  app,
  snap,
  worktreeId
}: {
  app: App;
  snap: AppSnapshot;
  worktreeId: string;
}): ReactElement {
  const { headerRef, viewStacked, previewStacked } = useWorktreeHeaderLayout();
  const worktree = snap.worktrees.find((f) => f.worktreeId === worktreeId);
  const unit = app.topbarUnits().find((u) => u.unitId === snap.selectedUnitId);
  const preview = snap.previews.get(worktreeId);
  const previewError = snap.previewErrors.get(worktreeId);
  const mergeable = preview?.mergeable ?? false;
  const unitBadge =
    worktree !== undefined && unit !== undefined ? app.unitBadgeInfo(worktree, unit) : undefined;
  const name = worktree?.name || worktreeId || t().topbar.fallbackWorktreeName;
  const status =
    previewError !== undefined
      ? t().topbar.previewUnavailable
      : preview?.diverged
        ? mergeable
          ? snap.viewPreview
            ? t().topbar.divergedShowingPreview
            : t().topbar.divergedShowingOriginal
          : t().topbar.conflictCount(preview.conflicts.length)
        : undefined;
  const compactStatus =
    previewError === undefined && preview?.diverged && mergeable
      ? t().topbar.latestVersionChanged
      : undefined;
  const toggleClass =
    "grid h-8 w-max max-w-full shrink-0 grid-cols-[repeat(2,minmax(max-content,1fr))] gap-0 rounded-lg bg-muted p-0.5 group-data-[stacked=true]/segment:h-auto group-data-[stacked=true]/segment:w-full group-data-[stacked=true]/segment:min-w-0 group-data-[stacked=true]/segment:grid-cols-1";
  const toggleItemClass =
    "min-h-7 whitespace-nowrap px-3.5 py-0 text-[13px] group-data-[stacked=true]/segment:min-w-0 group-data-[stacked=true]/segment:whitespace-normal group-data-[stacked=true]/segment:[overflow-wrap:anywhere]";
  const actionClass =
    "h-auto min-h-8 max-w-full whitespace-normal py-1.5 leading-4 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]";
  return (
    <header
      ref={headerRef}
      data-header-layout="flow"
      className="topbar group/header relative flex min-h-11 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-background px-4 py-1.5 data-[header-layout=centered]:grid data-[header-layout=centered]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <div
        data-testid="worktree-title"
        data-header-title
        className="flex min-w-0 items-center gap-2.5 group-data-[header-layout=flow]/header:min-w-[min(var(--header-title-min,260px),100%)] group-data-[header-layout=flow]/header:flex-[1_1_var(--header-title-min,260px)] group-data-[status-row=true]/header:flex-wrap group-data-[status-row=true]/header:gap-y-1.5"
      >
        <span data-header-leading className="flex shrink-0 items-center gap-2.5">
          {snap.sidebarCollapsed && (
            <span aria-hidden="true" className="sidebar-toggle-spacer size-8 shrink-0" />
          )}
          <TitleUnitIcon
            type={unit?.type ?? 2}
            className="border-amber-200/80 bg-amber-50 text-amber-600"
          />
        </span>
        <div
          data-header-title-copy
          className="flex min-w-0 flex-[0_1_auto] items-center gap-1.5 group-data-[status-row=true]/header:basis-[var(--header-title-copy-width)]"
        >
          <span
            data-header-name
            className="min-w-[min(var(--header-name-natural,100px),100px)] max-w-[280px] truncate text-sm font-semibold"
            title={name}
          >
            {name}
          </span>
          {unitBadge && <ChangeTag variant={unitBadge.variant}>{unitBadge.text}</ChangeTag>}
        </div>
        {status !== undefined && (
          <Badge
            data-header-status
            variant={previewError !== undefined ? "warn" : mergeable ? "info" : "danger"}
            title={previewError ?? status}
            aria-label={status}
            className="min-w-0 max-w-full px-2 py-1 text-[11px] leading-4 group-data-[status-row=true]/header:order-3 group-data-[status-row=true]/header:basis-full"
          >
            {(previewError !== undefined || !mergeable) && <TriangleAlert />}
            <span
              data-header-status-full
              className={cn(
                "[overflow-wrap:anywhere]",
                compactStatus !== undefined &&
                  "whitespace-nowrap group-data-[status-compact=true]/header:hidden group-data-[status-row=true]/header:whitespace-normal"
              )}
            >
              {status}
            </span>
            {compactStatus !== undefined && (
              <span
                data-header-status-short
                className="hidden min-w-0 whitespace-nowrap [overflow-wrap:anywhere] group-data-[status-compact=true]/header:inline group-data-[status-row=true]/header:whitespace-normal"
              >
                {compactStatus}
              </span>
            )}
          </Badge>
        )}
      </div>
      <div
        data-testid="view-diff-center"
        data-header-segment="view"
        className="group/segment w-max max-w-full flex-none data-[stacked=true]:w-full group-data-[header-layout=centered]/header:col-start-2"
      >
        <SegmentedToggle
          className={cn(toggleClass, "min-w-[174px]")}
          itemClassName={toggleItemClass}
          orientation={viewStacked ? "vertical" : "horizontal"}
          value={snap.comparisonMode ? "diff" : "view"}
          options={[
            { value: "view", label: t().topbar.segView },
            { value: "diff", label: t().topbar.segDiff }
          ]}
          onChange={(value) => void app.setComparisonMode(value === "diff")}
        />
      </div>
      <div
        data-header-trailing
        className="flex w-max max-w-none items-center justify-self-end gap-3 group-data-[header-layout=flow]/header:contents"
      >
        {preview?.diverged && (
          <div
            data-header-segment="preview"
            className="group/segment w-max max-w-full flex-none data-[stacked=true]:w-full"
          >
            <SegmentedToggle
              className={cn(toggleClass, "min-w-[min(236px,var(--header-available))]")}
              itemClassName={toggleItemClass}
              orientation={previewStacked ? "vertical" : "horizontal"}
              value={snap.viewPreview ? "preview" : "original"}
              options={[
                { value: "preview", label: t().topbar.segPreview },
                { value: "original", label: t().topbar.segOriginal }
              ]}
              onChange={(value) => app.setViewPreview(value === "preview")}
            />
          </div>
        )}
        <div
          data-testid="worktree-actions"
          className="ml-auto flex w-max max-w-full flex-none flex-wrap items-center justify-end gap-2 empty:hidden group-data-[header-layout=centered]/header:max-w-none group-data-[header-layout=centered]/header:flex-nowrap"
        >
          {snap.comparisonMode && snap.comparisonData?.response.stale && (
            <Button
              variant="outline"
              size="sm"
              className={actionClass}
              onClick={() => void app.refreshUnitComparison()}
            >
              <RefreshCw />
              <span>{t().topbar.refreshComparison}</span>
            </Button>
          )}
          {worktree?.status === "draft" && (
            <Button size="sm" className={actionClass} onClick={() => void app.doReady(worktreeId)}>
              <CircleCheck />
              <span>{t().topbar.submitForReview}</span>
            </Button>
          )}
          {worktree?.status === "ready" && (
            <Button
              size="sm"
              className={actionClass}
              disabled={preview !== undefined && !mergeable}
              onClick={() => {
                if (preview !== undefined && !mergeable) {
                  toast(t().toast.conflictsCannotMerge);
                  return;
                }
                void app.doMerge(worktreeId);
              }}
            >
              <GitMerge />
              <span>{t().topbar.mergeToCurrent}</span>
            </Button>
          )}
          {(worktree?.status === "draft" || worktree?.status === "ready") && (
            <Button
              variant="destructiveGhost"
              size="sm"
              className={actionClass}
              onClick={() => void app.doDiscard(worktreeId)}
            >
              <Trash2 />
              <span>{t().topbar.discard}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
