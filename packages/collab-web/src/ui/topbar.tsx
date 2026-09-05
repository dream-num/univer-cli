import {
  CircleCheck,
  Eye,
  GitMerge,
  RefreshCw,
  Lock,
  Pencil,
  Trash2,
  TriangleAlert
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ChangeTag } from "../components/ui/change-tag";
import { SegmentedToggle } from "../components/ui/toggle-group";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import type { App, AppSnapshot } from "./app";
import { toast } from "./modals";
import { UnitIcon } from "./unit-icon";
import { useWorktreeHeaderLayout } from "./worktree-header-layout";

// ---- topbar ----

export function Topbar({ app, snap }: { app: App; snap: AppSnapshot }): ReactElement {
  const { headerRef, viewStacked, previewStacked } = useWorktreeHeaderLayout(
    snap.view.kind === "worktree"
  );
  const leading = snap.sidebarCollapsed ? (
    <span aria-hidden="true" className="sidebar-toggle-spacer size-8 shrink-0" />
  ) : undefined;
  return (
    <header
      ref={headerRef}
      data-header-layout={snap.view.kind === "worktree" ? "flow" : undefined}
      className={cn(
        "topbar relative min-h-11 min-w-0 shrink-0 items-center border-b border-border bg-background px-4",
        snap.view.kind === "worktree"
          ? "group/header flex flex-wrap gap-x-3 gap-y-1.5 py-1.5 data-[header-layout=centered]:grid data-[header-layout=centered]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
          : "flex flex-wrap justify-between gap-x-4 gap-y-2 py-1"
      )}
    >
      {snap.view.kind === "trunk" ? (
        <TrunkTitle app={app} snap={snap} leading={leading} />
      ) : (
        <WorktreeTitle
          app={app}
          snap={snap}
          worktreeId={snap.view.worktreeId}
          leading={leading}
          viewStacked={viewStacked}
          previewStacked={previewStacked}
        />
      )}
    </header>
  );
}

function TitleUnitIcon({
  type,
  className,
  children
}: {
  type: number;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs [&_svg]:size-4",
        className ?? "border-border bg-background text-muted-foreground"
      )}
    >
      {children ?? <UnitIcon type={type} />}
    </span>
  );
}

function TrunkTitle({
  app,
  snap,
  leading
}: {
  app: App;
  snap: AppSnapshot;
  leading?: ReactNode;
}): ReactElement {
  const unit = snap.trunkUnits.find((u) => u.unitId === snap.selectedUnitId);
  const pending = app.pendingWorktreeCount();
  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <TitleUnitIcon type={unit?.type ?? 2} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">{unit?.name ?? app.univerfileName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            · {t().topbar.currentVersion}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {unit === undefined ? (
          <Badge variant="outline">
            <Eye />
            {t().topbar.viewOnly}
          </Badge>
        ) : pending === 0 ? (
          <Badge variant="ok">
            <Pencil />
            {t().topbar.editable}
          </Badge>
        ) : snap.trunkEditingOptIn ? (
          <>
            <Badge variant="warn">
              <Pencil />
              {t().topbar.editingPending(pending)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => app.stopTrunkEdit()}>
              {t().topbar.stopEditing}
            </Button>
          </>
        ) : (
          <>
            <Badge variant="warn">
              <Lock />
              {t().topbar.lockedPending(pending)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void app.startTrunkEdit()}>
              {t().topbar.editAnyway}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function WorktreeTitle({
  app,
  snap,
  worktreeId,
  leading,
  viewStacked,
  previewStacked
}: {
  app: App;
  snap: AppSnapshot;
  worktreeId: string;
  leading?: ReactNode;
  viewStacked: boolean;
  previewStacked: boolean;
}): ReactElement {
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
    <>
      <div
        data-testid="worktree-title"
        data-header-title
        className="flex min-w-0 items-center gap-2.5 group-data-[header-layout=flow]/header:min-w-[min(var(--header-title-min,260px),100%)] group-data-[header-layout=flow]/header:flex-[1_1_var(--header-title-min,260px)] group-data-[status-row=true]/header:flex-wrap group-data-[status-row=true]/header:gap-y-1.5"
      >
        <span data-header-leading className="flex shrink-0 items-center gap-2.5">
          {leading}
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
    </>
  );
}
