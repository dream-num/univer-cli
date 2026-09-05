import { CircleCheck, GitMerge, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ChangeTag } from "../../components/ui/change-tag";
import { SegmentedToggle } from "../../components/ui/toggle-group";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import { TitleUnitIcon } from "../title-unit-icon";
import { useHeaderLayout } from "./layout";
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
  const { title, unitType, changeTag, status, primaryAction } = model;
  const messages = t().topbar;
  const { headerRef, layout, titleMinimum } = useHeaderLayout(model, messages);
  const toggleClass =
    "grid h-auto w-full max-w-full shrink-0 grid-cols-2 gap-0 rounded-lg bg-muted p-0.5";
  const toggleItemClass =
    "min-h-7 min-w-0 whitespace-normal px-3.5 py-1 text-[13px] [overflow-wrap:anywhere] group-data-[header-layout=centered]/header:whitespace-nowrap group-data-[header-layout=measuring]/header:whitespace-nowrap";
  const actionClass =
    "h-auto min-h-8 max-w-full whitespace-normal py-1.5 leading-4 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]";
  return (
    <header
      ref={headerRef}
      data-header-layout={layout}
      style={{ "--header-title-min": `${titleMinimum}px` } as CSSProperties}
      className={cn(
        "topbar group/header relative min-h-11 min-w-0 shrink-0 items-center gap-x-3 gap-y-1.5 border-b border-border bg-background px-4 py-1.5",
        layout === "flow" ? "flex flex-wrap" : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      )}
    >
      <div
        data-testid="worktree-title"
        data-header-title
        className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 group-data-[header-layout=flow]/header:min-w-[min(var(--header-title-min),100%)] group-data-[header-layout=flow]/header:flex-[1_1_var(--header-title-min)]"
      >
        <div
          data-header-title-row
          className="flex min-w-0 max-w-full items-center gap-2.5 group-data-[header-layout=measuring]/header:w-max group-data-[header-layout=measuring]/header:max-w-none group-data-[header-layout=measuring]/header:shrink-0"
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
          <div data-header-title-copy className="flex min-w-0 items-center gap-1.5">
            <span
              data-header-name
              className="max-w-max flex-[1_0_100px] overflow-hidden text-sm font-semibold"
              title={title}
            >
              <span className="block max-w-[280px] truncate">{title}</span>
            </span>
            {changeTag && (
              <ChangeTag
                variant={changeTag.variant}
                className="min-w-0 shrink [overflow-wrap:anywhere]"
              >
                {changeTag.text}
              </ChangeTag>
            )}
          </div>
        </div>
        {status !== undefined && (
          <Badge
            data-header-status
            variant={status.tone}
            title={status.tooltip}
            aria-label={status.text}
            className="min-w-0 max-w-full px-2 py-1 text-[11px] leading-4"
          >
            {status.tone !== "info" && <TriangleAlert />}
            <span
              data-header-status-full
              className="min-w-0 whitespace-normal [overflow-wrap:anywhere]"
            >
              {status.text}
            </span>
          </Badge>
        )}
      </div>
      <div
        data-testid="view-diff-center"
        data-header-segment="view"
        className={cn(
          "flex-none",
          layout === "flow" ? "min-w-[min(174px,100%)] max-w-full" : "w-max min-w-[174px]"
        )}
      >
        <SegmentedToggle
          className={toggleClass}
          itemClassName={toggleItemClass}
          value={model.viewMode}
          options={[
            { value: "view", label: messages.segView },
            { value: "diff", label: messages.segDiff }
          ]}
          onChange={onViewModeChange}
        />
      </div>
      <div
        data-header-trailing
        className={
          layout === "flow" ? "contents" : "flex w-max items-center justify-self-end gap-3"
        }
      >
        {model.previewSource !== undefined && (
          <div
            data-header-segment="preview"
            className={cn(
              "flex-none",
              layout === "flow" ? "min-w-[min(236px,100%)] max-w-full" : "min-w-[236px]"
            )}
          >
            <SegmentedToggle
              className={toggleClass}
              itemClassName={toggleItemClass}
              value={model.previewSource}
              options={[
                { value: "preview", label: messages.segPreview },
                { value: "original", label: messages.segOriginal }
              ]}
              onChange={onPreviewSourceChange}
            />
          </div>
        )}
        <div
          data-testid="worktree-actions"
          className={cn(
            "flex min-w-0 flex-none items-center justify-end gap-2 empty:hidden",
            layout === "flow" ? "ml-auto max-w-full flex-wrap" : "flex-nowrap"
          )}
        >
          {model.canRefreshComparison && (
            <Button
              variant="outline"
              size="sm"
              className={actionClass}
              onClick={onRefreshComparison}
            >
              <RefreshCw />
              <span>{messages.refreshComparison}</span>
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
                  ? messages.submitForReview
                  : messages.mergeToCurrent}
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
              <span>{messages.discard}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
