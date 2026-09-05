import { CircleCheck, GitMerge, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ChangeTag } from "../../components/ui/change-tag";
import { SegmentedToggle } from "../../components/ui/toggle-group";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import { TitleUnitIcon } from "../title-unit-icon";
import { useWorktreeHeaderLayout } from "./layout";
import type { WorktreeHeaderEvents, WorktreeHeaderModel } from "./model";

export interface WorktreeHeaderProps extends WorktreeHeaderEvents {
  model: WorktreeHeaderModel;
}

export function WorktreeHeader({
  model,
  onViewModeChange,
  onPreviewSourceChange,
  onPrimaryAction,
  onDiscard,
  onRefreshComparison
}: WorktreeHeaderProps): ReactElement {
  const { headerRef, measurementRef, layout } = useWorktreeHeaderLayout();
  const { title, unitType, changeTag, status, primaryAction } = model;
  const toggleClass =
    "grid h-8 w-max max-w-full shrink-0 grid-cols-[repeat(2,minmax(max-content,1fr))] gap-0 rounded-lg bg-muted p-0.5 group-data-[stacked=true]/segment:h-auto group-data-[stacked=true]/segment:w-full group-data-[stacked=true]/segment:min-w-0 group-data-[stacked=true]/segment:grid-cols-1";
  const toggleItemClass =
    "min-h-7 whitespace-nowrap px-3.5 py-0 text-[13px] group-data-[stacked=true]/segment:min-w-0 group-data-[stacked=true]/segment:whitespace-normal group-data-[stacked=true]/segment:[overflow-wrap:anywhere]";
  const actionClass =
    "h-auto min-h-8 max-w-full whitespace-normal py-1.5 leading-4 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]";
  return (
    <>
      <header
        ref={headerRef}
        data-header-layout={layout.mode}
        data-status-compact={layout.statusCompact}
        data-status-row={layout.statusRow}
        style={
          {
            "--header-name-natural": `${layout.nameNatural}px`,
            "--header-available": `${layout.available}px`,
            "--header-title-min": `${layout.titleMinimum}px`,
            "--header-title-copy-width": `${layout.titleCopyWidth}px`
          } as CSSProperties
        }
        className="topbar group/header relative flex min-h-11 min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-background px-4 py-1.5 data-[header-layout=centered]:grid data-[header-layout=centered]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <div
          data-testid="worktree-title"
          data-header-title
          className="flex min-w-0 items-center gap-2.5 group-data-[header-layout=flow]/header:min-w-[min(var(--header-title-min,260px),100%)] group-data-[header-layout=flow]/header:flex-[1_1_var(--header-title-min,260px)] group-data-[status-row=true]/header:flex-wrap group-data-[status-row=true]/header:gap-y-1.5"
        >
          <span data-header-leading className="flex shrink-0 items-center gap-2.5">
            {model.reserveSidebarToggle && (
              <span aria-hidden="true" className="sidebar-toggle-spacer size-8 shrink-0" />
            )}
            <TitleUnitIcon
              type={unitType}
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
              title={title}
            >
              {title}
            </span>
            {changeTag && <ChangeTag variant={changeTag.variant}>{changeTag.text}</ChangeTag>}
          </div>
          {status !== undefined && (
            <Badge
              data-header-status
              variant={status.tone}
              title={status.tooltip}
              aria-label={status.text}
              className="min-w-0 max-w-full px-2 py-1 text-[11px] leading-4 group-data-[status-row=true]/header:order-3 group-data-[status-row=true]/header:basis-full"
            >
              {status.tone !== "info" && <TriangleAlert />}
              <span
                data-header-status-full
                className={cn(
                  "[overflow-wrap:anywhere]",
                  status.compactText !== undefined &&
                    "whitespace-nowrap group-data-[status-compact=true]/header:hidden group-data-[status-row=true]/header:whitespace-normal"
                )}
              >
                {status.text}
              </span>
              {status.compactText !== undefined && (
                <span
                  data-header-status-short
                  className="hidden min-w-0 whitespace-nowrap [overflow-wrap:anywhere] group-data-[status-compact=true]/header:inline group-data-[status-row=true]/header:whitespace-normal"
                >
                  {status.compactText}
                </span>
              )}
            </Badge>
          )}
        </div>
        <div
          data-testid="view-diff-center"
          data-header-segment="view"
          data-stacked={layout.viewStacked}
          className="group/segment w-max max-w-full flex-none data-[stacked=true]:w-full group-data-[header-layout=centered]/header:col-start-2"
        >
          <SegmentedToggle
            className={cn(toggleClass, "min-w-[174px]")}
            itemClassName={toggleItemClass}
            orientation={layout.viewStacked ? "vertical" : "horizontal"}
            value={model.viewMode}
            options={[
              { value: "view", label: t().topbar.segView },
              { value: "diff", label: t().topbar.segDiff }
            ]}
            onChange={onViewModeChange}
          />
        </div>
        <div
          data-header-trailing
          className="flex w-max max-w-none items-center justify-self-end gap-3 group-data-[header-layout=flow]/header:contents"
        >
          {model.previewSource !== undefined && (
            <div
              data-header-segment="preview"
              data-stacked={layout.previewStacked}
              className="group/segment w-max max-w-full flex-none data-[stacked=true]:w-full"
            >
              <SegmentedToggle
                className={cn(toggleClass, "min-w-[min(236px,var(--header-available))]")}
                itemClassName={toggleItemClass}
                orientation={layout.previewStacked ? "vertical" : "horizontal"}
                value={model.previewSource}
                options={[
                  { value: "preview", label: t().topbar.segPreview },
                  { value: "original", label: t().topbar.segOriginal }
                ]}
                onChange={onPreviewSourceChange}
              />
            </div>
          )}
          <div
            data-testid="worktree-actions"
            className="ml-auto flex w-max max-w-full flex-none flex-wrap items-center justify-end gap-2 empty:hidden group-data-[header-layout=centered]/header:max-w-none group-data-[header-layout=centered]/header:flex-nowrap"
          >
            {model.canRefreshComparison && (
              <Button
                variant="outline"
                size="sm"
                className={actionClass}
                onClick={onRefreshComparison}
              >
                <RefreshCw />
                <span>{t().topbar.refreshComparison}</span>
              </Button>
            )}
            {primaryAction && (
              <Button
                size="sm"
                className={actionClass}
                disabled={primaryAction.kind === "merge" && primaryAction.disabled}
                onClick={onPrimaryAction}
              >
                {primaryAction.kind === "submit" ? <CircleCheck /> : <GitMerge />}
                <span>
                  {primaryAction.kind === "submit"
                    ? t().topbar.submitForReview
                    : t().topbar.mergeToCurrent}
                </span>
              </Button>
            )}
            {model.canDiscard && (
              <Button
                variant="destructiveGhost"
                size="sm"
                className={actionClass}
                onClick={onDiscard}
              >
                <Trash2 />
                <span>{t().topbar.discard}</span>
              </Button>
            )}
          </div>
        </div>
      </header>
      <div
        ref={measurementRef}
        aria-hidden="true"
        inert
        className="pointer-events-none invisible fixed left-0 top-0 -z-10"
      />
    </>
  );
}
