import type {
  UnitComparisonContextChange,
  UnitComparisonContextDiffKind
} from "@univer/collab-gateway-contract"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactElement } from "react"
import { cn } from "../lib/utils"
import { t } from "../i18n"

const VISIBLE_CHANGE_COUNT = 2

/**
 * Compact, product-neutral bridge between the structural change list and the native canvases.
 * It deliberately consumes the same normalized leaf-change contract returned to agents.
 */
export function ComparisonChangeNavigator(input: {
  readonly changeIndex: number
  readonly item:
    | {
      readonly changes: readonly UnitComparisonContextChange[]
        readonly entityLabel?: string
        readonly kind: UnitComparisonContextDiffKind
        readonly label: string
      }
    | null
  readonly total: number
  readonly onNext: () => void
  readonly onPrevious: () => void
}): ReactElement {
  const item = input.item
  const visibleChanges = item?.changes.slice(0, VISIBLE_CHANGE_COUNT) ?? []
  const hiddenCount = Math.max(0, (item?.changes.length ?? 0) - visibleChanges.length)
  return (
    <nav
      aria-label={t().diff.changes}
      className="grid min-h-[54px] min-w-0 grid-cols-[minmax(150px,0.65fr)_minmax(0,1.35fr)_auto] items-center gap-3 border-b border-border bg-[linear-gradient(180deg,var(--color-card),color-mix(in_srgb,var(--color-muted)_24%,var(--color-card)))] px-3 py-1.5 max-[720px]:grid-cols-[minmax(0,1fr)_auto]"
      data-testid="comparison-change-navigator"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "h-8 w-1 shrink-0 rounded-full",
            item === null ? "bg-border" : toneClass(item.kind, "bar")
          )}
        />
        <div className="grid min-w-0 gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
            {t().diff.changes}
          </span>
          <span className="truncate text-[12px] font-semibold text-foreground" title={item?.label}>
            {item?.label ?? t().diff.noStructuralChanges}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] max-[720px]:col-span-2 max-[720px]:col-start-1 max-[720px]:row-start-2">
        {visibleChanges.length === 0 ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {item === null ? t().diff.noStructuralChanges : t().diff.kind[item.kind]}
          </span>
        ) : (
          visibleChanges.map((change, index) => (
            <ChangeChip
              key={`${change.path.join(".")}:${index}`}
              change={change}
              {...(item?.entityLabel === undefined ? {} : { entityLabel: item.entityLabel })}
            />
          ))
        )}
        {hiddenCount > 0 ? (
          <span className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
            +{hiddenCount}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 max-[720px]:col-start-2 max-[720px]:row-start-1">
        <span className="min-w-12 text-center text-[10px] font-semibold tabular-nums text-muted-foreground">
          {input.total === 0 ? "0 / 0" : `${input.changeIndex + 1} / ${input.total}`}
        </span>
        <button
          aria-label={`${t().diff.changes} · ${input.changeIndex}`}
          className="grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-xs outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={input.changeIndex <= 0}
          type="button"
          onClick={input.onPrevious}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          aria-label={`${t().diff.changes} · ${input.changeIndex + 2}`}
          className="grid size-8 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-xs outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={input.total === 0 || input.changeIndex >= input.total - 1}
          type="button"
          onClick={input.onNext}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </nav>
  )
}

function ChangeChip(input: {
  readonly change: UnitComparisonContextChange
  readonly entityLabel?: string
}): ReactElement {
  const wholeEntity = input.entityLabel ?? t().diff.wholeItem
  const path = input.change.path.length === 0
    ? `${t().diff.kind[input.change.kind]}${wholeEntity.length === 0 ? "" : ` · ${wholeEntity}`}`
    : t().diff.changePath(input.change.path)
  const wholeEntityChange = input.change.path.length === 0
  return (
    <span
      className={cn(
        "flex h-8 max-w-[360px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10px] shadow-xs",
        toneClass(input.change.kind, "chip")
      )}
      title={`${path}: ${formatValue(input.change.before)} → ${formatValue(input.change.after)}`}
    >
      <span className="shrink-0 font-semibold opacity-80">{path}</span>
      {wholeEntityChange ? null : <span aria-hidden="true" className="opacity-45">·</span>}
      {wholeEntityChange ? null : input.change.segments === undefined ? (
        <span className="min-w-0 truncate">
          <Value change={input.change} side="left" value={input.change.before} />
          <span className="px-1 opacity-45">→</span>
          <Value change={input.change} side="right" value={input.change.after} />
        </span>
      ) : (
        <span className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
          <InlineSegments segments={input.change.segments.left} side="left" />
          <span className="px-1 opacity-45">→</span>
          <InlineSegments segments={input.change.segments.right} side="right" />
        </span>
      )}
    </span>
  )
}

function InlineSegments(input: {
  readonly segments: NonNullable<UnitComparisonContextChange["segments"]>["left"]
  readonly side: "left" | "right"
}): ReactElement {
  return (
    <span className="min-w-0 truncate">
      {input.segments.map((segment, index) => (
        <span
          key={`${segment.kind}:${index}`}
          className={cn(
            segment.kind === "delete" && "bg-diff-delete-muted text-diff-delete line-through",
            segment.kind === "insert" && "bg-diff-insert-muted text-diff-insert",
            segment.kind === "equal" && "text-foreground/60",
            input.side === "left" && segment.kind !== "equal" && "decoration-1"
          )}
        >
          {segment.text}
        </span>
      ))}
    </span>
  )
}

function Value(input: {
  readonly change: UnitComparisonContextChange
  readonly side: "left" | "right"
  readonly value: unknown
}): ReactElement {
  return (
    <span
      className={cn(
        input.side === "left" && input.value !== undefined && "text-diff-delete line-through",
        input.side === "right" && input.value !== undefined && "text-diff-insert"
      )}
    >
      {formatValue(input.value, input.change.valueType)}
    </span>
  )
}

function formatValue(
  value: unknown,
  valueType: UnitComparisonContextChange["valueType"] = "unknown"
): string {
  if (value === undefined) return "∅"
  if (value === null) return "null"
  if (valueType === "boolean" && typeof value === "boolean") {
    return value ? t().diff.checkboxState.checked : t().diff.checkboxState.unchecked
  }
  if (typeof value === "string") {
    if (valueType !== "text" && valueType !== "formula" && /^[{[]/u.test(value.trim())) {
      try {
        return formatValue(JSON.parse(value) as unknown, valueType)
      } catch {
        return value
      }
    }
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return t().diff.itemCount(value.length)
  const record = asRecord(value)
  if (record === undefined) return String(value)
  const primitive = [record.rgb, record.v, record.value, record.text].find(
    (candidate) => typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean"
  )
  return primitive === undefined ? t().diff.propertyCount(Object.keys(record).length) : String(primitive)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function toneClass(kind: UnitComparisonContextDiffKind, part: "bar" | "chip"): string {
  if (kind === "delete") {
    return part === "bar"
      ? "bg-diff-delete"
      : "border-diff-delete/25 bg-diff-delete-muted/70 text-diff-delete"
  }
  if (kind === "insert") {
    return part === "bar"
      ? "bg-diff-insert"
      : "border-diff-insert/25 bg-diff-insert-muted/70 text-diff-insert"
  }
  return part === "bar"
    ? "bg-diff-update"
    : "border-diff-update/25 bg-diff-update-muted/70 text-diff-update"
}
