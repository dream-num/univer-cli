import { Eye, Lock, Pencil } from "lucide-react";
import type { ReactElement } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { t } from "../i18n";
import type { App, AppSnapshot } from "./app";
import { TitleUnitIcon } from "./title-unit-icon";
import { WorktreeHeader } from "./worktree-header";

export function Topbar({ app, snap }: { app: App; snap: AppSnapshot }): ReactElement {
  return snap.view.kind === "worktree" ? (
    <WorktreeHeader app={app} snap={snap} worktreeId={snap.view.worktreeId} />
  ) : (
    <TrunkHeader app={app} snap={snap} />
  );
}

function TrunkHeader({ app, snap }: { app: App; snap: AppSnapshot }): ReactElement {
  const unit = snap.trunkUnits.find((u) => u.unitId === snap.selectedUnitId);
  const pending = app.pendingWorktreeCount();
  return (
    <header className="topbar relative flex min-h-11 min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-1">
      <div className="flex min-w-0 items-center gap-2.5">
        {snap.sidebarCollapsed && (
          <span aria-hidden="true" className="sidebar-toggle-spacer size-8 shrink-0" />
        )}
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
    </header>
  );
}
