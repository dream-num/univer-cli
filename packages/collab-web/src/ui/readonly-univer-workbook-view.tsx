import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from "react";
import type { WorkbookCompareRangeHighlight, WorkbookCompareSheetGapConfig } from "@univer/workbook-compare";
import type { UnitStructuralDiffItem } from "@univer/unit-compare";
import { UNIT_TYPE_SHEET } from "@univer/collab-gateway-contract";
import {
  getIntersectRange,
  ICommandService,
  type IDisposable,
  type ILanguagePack,
  type IRange,
  type IWorkbookData,
  IUniverInstanceService,
  LocaleType,
  LogLevel,
  type Workbook,
  Univer,
  UniverInstanceType
} from "@univerjs/core";
import { IRenderManagerService, SHEET_VIEWPORT_KEY } from "@univerjs/engine-render";
import { SheetsSelectionsService } from "@univerjs/sheets";
import { FWorkbook, type FWorksheet } from "@univerjs/sheets/facade";
import {
  ISheetSelectionRenderService,
  SetScrollOperation,
  SheetSkeletonManagerService
} from "@univerjs/sheets-ui";
import {
  registerViewRendering,
  TEST_LICENSE,
  ViewAssetIoOwner
} from "@univer/render-preset";
import { currentLang, sdkLocaleOf, t } from "../i18n/index.js";
import { loadViewerLocale } from "../core/locales/generated/load.js";
import { registerFormulaTextDisplay } from "../core/formula-text-display.js";
import {
  createNativeComparisonHighlightController,
  type NativeComparisonHighlightController
} from "../core/native-comparison-highlights.js";
import { compactHighlightRanges } from "./compact-highlight-ranges.js";
import { blockLocalEditingCommands } from "../core/viewer-readonly.js";

import "@univerjs/engine-formula/facade";
import "@univer/render-preset/facades";
import "@univerjs/sheets/facade";
import "@univerjs/sheets-filter/facade";
import "@univerjs/sheets-formula/facade";
import "@univerjs/sheets-numfmt/facade";
import "@univerjs/sheets-table/facade";
import "@univerjs/sheets-ui/facade";
import "@univerjs/ui/facade";

export function ReadonlyUniverWorkbookView(input: {
  readonly activeSheetId?: string | null;
  readonly createUniver?: (container: HTMLElement, options: { readonly footer: boolean }) => Univer;
  readonly comparison?: {
    readonly items: readonly UnitStructuralDiffItem[];
    readonly selectedItemId?: string;
    readonly side: "left" | "right";
  };
  readonly controlledScroll?: ReadonlyWorkbookControlledScroll | null;
  readonly controlledSelection?: ReadonlyWorkbookControlledSelection | null;
  readonly gapConfig?: WorkbookCompareSheetGapConfig | null;
  readonly highlights?: readonly WorkbookCompareRangeHighlight[];
  readonly onScrollChange?: (payload: ReadonlyWorkbookScrollPayload) => void;
  readonly onSelectionChange?: (payload: ReadonlyWorkbookSelectionPayload) => void;
  readonly selectedKind?: WorkbookCompareRangeHighlight["kind"] | null;
  readonly selectedRange?: IRange | null;
  readonly showFooter?: boolean;
  readonly showFormulaText?: boolean;
  readonly snapshot: unknown;
}): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeWorkbookRef = useRef<FWorkbook | null>(null);
  const univerRef = useRef<Univer | null>(null);
  const formulaDisplayRef = useRef<IDisposable | null>(null);
  const selectedHighlightRef = useRef<IDisposable | null>(null);
  const comparisonHighlightRef = useRef<NativeComparisonHighlightController | null>(null);
  const selectedKindRef = useRef(input.selectedKind ?? null);
  const selectedRangeRef = useRef(input.selectedRange ?? null);
  const showFormulaTextRef = useRef(input.showFormulaText ?? false);
  const currentWorkbookIdRef = useRef<string | null>(null);
  const lastAppliedScrollKeyRef = useRef<string | null>(null);
  const lastEmittedScrollKeyRef = useRef<string | null>(null);
  const lastAppliedSelectionKeyRef = useRef<string | null>(null);
  const lastEmittedSelectionKeyRef = useRef<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const locale = sdkLocaleOf(currentLang());
  selectedKindRef.current = input.selectedKind ?? null;
  selectedRangeRef.current = input.selectedRange ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const viewerHost = document.createElement("div");
    viewerHost.style.width = "100%";
    viewerHost.style.height = "100%";
    container.replaceChildren(viewerHost);
    setRenderError(null);

    let univer: Univer | null = null;
    let animationFrameId: number | null = null;
    const cleanup: Array<() => void> = [];
    let disposed = false;
    activeWorkbookRef.current = null;
    univerRef.current = null;
    currentWorkbookIdRef.current = null;
    lastAppliedScrollKeyRef.current = null;
    lastEmittedScrollKeyRef.current = null;
    lastAppliedSelectionKeyRef.current = null;
    lastEmittedSelectionKeyRef.current = null;

    const initialize = async (): Promise<void> => {
    try {
      const localePack = await loadViewerLocale(locale);
      if (disposed) return;
      univer = input.createUniver === undefined
        ? createReadonlyDesktopUniver(viewerHost, { footer: input.showFooter ?? true, locale, localePack })
        : input.createUniver(viewerHost, { footer: input.showFooter ?? true });
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, input.snapshot as IWorkbookData);

      const injector = univer.__getInjector();
      const workbookModel = injector
        .get(IUniverInstanceService)
        .getCurrentUnitOfType<Workbook>(UniverInstanceType.UNIVER_SHEET);
      const activeWorkbook =
        workbookModel == null ? null : injector.createInstance(FWorkbook, workbookModel);
      const targetSheet =
        input.activeSheetId === undefined || input.activeSheetId === null
          ? null
          : (activeWorkbook?.getSheetBySheetId(input.activeSheetId) ?? null);

      (targetSheet ?? activeWorkbook?.getActiveSheet())?.activate();

      if (activeWorkbook != null) {
        univerRef.current = univer;
        if (showFormulaTextRef.current) {
          formulaDisplayRef.current = registerFormulaTextDisplay(univer, activeWorkbook);
        }
        activeWorkbookRef.current = activeWorkbook;
        currentWorkbookIdRef.current = activeWorkbook.getId();
        if (input.comparison !== undefined) {
          const controller = createNativeComparisonHighlightController({
            univer,
            unitId: activeWorkbook.getId(),
            unitType: UNIT_TYPE_SHEET,
            side: input.comparison.side,
            items: input.comparison.items,
            ...(input.comparison.selectedItemId === undefined
              ? {}
              : { selectedItemId: input.comparison.selectedItemId })
          });
          comparisonHighlightRef.current = controller;
          cleanup.push(() => {
            controller.dispose();
            if (comparisonHighlightRef.current === controller) {
              comparisonHighlightRef.current = null;
            }
          });
          await controller.refresh();
        }
        applySelectedRange(
          activeWorkbook,
          input.activeSheetId ?? null,
          input.selectedRange ?? null
        );

        blockLocalEditingCommands(injector.get(ICommandService));

        const renderManagerService = univer.__getInjector().get(IRenderManagerService);
        const workbookId = activeWorkbook.getId();
        const activeSheetId =
          (targetSheet ?? activeWorkbook.getActiveSheet())?.getSheetId() ?? null;
        cleanup.push(
          ...attachReadonlyPaneEvents({
            activeWorkbook,
            onSelectionChange: input.onSelectionChange,
            selectionService: injector.get(SheetsSelectionsService),
            lastEmittedSelectionKeyRef
          })
        );
        let gapConfigApplied = false;
        let selectionGuardsAttached = false;
        let scrollEventsAttached = false;
        const attachRenderServices = (): boolean => {
          gapConfigApplied ||= applySheetGapConfig({
            activeSheetId,
            gapConfig: input.gapConfig ?? null,
            renderManagerService,
            workbookId
          });
          const render = renderManagerService.getRenderUnitById(workbookId);
          if (render == null) {
            return false;
          }
          if (!scrollEventsAttached) {
            const viewport = render.scene.getViewport(SHEET_VIEWPORT_KEY.VIEW_MAIN);
            if (viewport === undefined) {
              return false;
            }
            const skeletonManagerService = render.with(SheetSkeletonManagerService);
            const subscription = viewport.onScrollAfter$.subscribeEvent((scrollState) => {
              const worksheet = activeWorkbook.getActiveSheet();
              if (worksheet === null) return;
              const skeleton = skeletonManagerService.getCurrentParam()?.skeleton;
              if (skeleton === undefined) return;
              const { row, column, rowOffset, columnOffset } =
                skeleton.getOffsetRelativeToRowCol(
                  scrollState.viewportScrollX,
                  scrollState.viewportScrollY
                );
              emitScrollPayload(
                {
                  lastAppliedScrollKeyRef,
                  lastEmittedScrollKeyRef,
                  onScrollChange: input.onScrollChange
                },
                worksheet,
                {
                  offsetX: columnOffset,
                  offsetY: rowOffset,
                  sheetViewStartColumn: column,
                  sheetViewStartRow: row
                }
              );
            });
            cleanup.push(() => subscription.unsubscribe());
            scrollEventsAttached = true;
          }
          if (selectionGuardsAttached) {
            return gapConfigApplied && scrollEventsAttached;
          }
          const selectionRenderService = readSelectionRenderService(
            renderManagerService,
            workbookId
          );
          if (selectionRenderService === null) {
            return false;
          }

          cleanup.push(...applySelectionRangeInteractionGuards(selectionRenderService));
          const highlightSheet = targetSheet ?? activeWorkbook.getActiveSheet();
          if (highlightSheet !== null) {
            const bounds = { startRow: 0, startColumn: 0, endRow: highlightSheet.getMaxRows() - 1, endColumn: highlightSheet.getMaxColumns() - 1 };
            for (const kind of ["delete", "insert", "update"] as const) {
              // Diff ranges can span the larger side; render only their intersection with this sheet.
              const ranges = compactHighlightRanges(
                (input.highlights ?? [])
                  .filter((item) => item.kind === kind)
                  .map((item) => getIntersectRange(item.range, bounds))
                  .filter((range): range is IRange => range != null)
              )
                .map((range) => highlightSheet.getRange(range.startRow, range.startColumn, range.endRow - range.startRow + 1, range.endColumn - range.startColumn + 1));
              if (ranges.length === 0) continue;
              const highlight = highlightSheet.highlightRanges(ranges, { fill: kind === "delete" ? "rgba(239,68,68,0.18)" : kind === "insert" ? "rgba(34,197,94,0.18)" : "rgba(59,130,246,0.18)", strokeWidth: 0, widgetSize: 0 });
              cleanup.push(() => highlight.dispose());
            }
            selectedHighlightRef.current?.dispose();
            selectedHighlightRef.current = createSelectedRangeHighlight(
              highlightSheet,
              selectedKindRef.current,
              selectedRangeRef.current
            );
          }
          selectionGuardsAttached = true;
          return gapConfigApplied && scrollEventsAttached;
        };

        const waitForRenderServices = (remainingFrames: number): void => {
          if (disposed || attachRenderServices() || remainingFrames <= 0) {
            return;
          }

          animationFrameId = requestAnimationFrame(() => {
            waitForRenderServices(remainingFrames - 1);
          });
        };

        waitForRenderServices(90);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize read-only workbook comparison pane", error);
      setRenderError(`${t().diff.renderFailed}: ${message}`);
      formulaDisplayRef.current?.dispose();
      formulaDisplayRef.current = null;
      selectedHighlightRef.current?.dispose();
      selectedHighlightRef.current = null;
      comparisonHighlightRef.current?.dispose();
      comparisonHighlightRef.current = null;
      univer?.dispose();
      viewerHost.remove();
      return;
    }
    };
    initialize().catch((error: unknown) => {
      if (!disposed) setRenderError(String(error));
    });

    return () => {
      formulaDisplayRef.current?.dispose();
      formulaDisplayRef.current = null;
      selectedHighlightRef.current?.dispose();
      selectedHighlightRef.current = null;
      activeWorkbookRef.current = null;
      univerRef.current = null;
      currentWorkbookIdRef.current = null;
      disposed = true;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      for (const dispose of cleanup) {
        dispose();
      }
      // Univer owns a nested React root. Dispose after the comparison shell's commit finishes;
      // the per-instance host prevents a delayed old viewer from touching its replacement.
      setTimeout(() => {
        univer?.dispose();
        viewerHost.remove();
      }, 0);
    };
  }, [input.activeSheetId, input.comparison?.items, input.comparison?.side, input.gapConfig, input.highlights, input.showFooter, input.snapshot, locale]);

  useEffect(() => {
    comparisonHighlightRef.current
      ?.setSelectedItem(input.comparison?.selectedItemId)
      .catch((error: unknown) => {
        console.error("Failed to update workbook object comparison highlight", error);
        setRenderError(error instanceof Error ? error.message : String(error));
      });
  }, [input.comparison?.selectedItemId]);

  useEffect(() => {
    showFormulaTextRef.current = input.showFormulaText ?? false;
    try {
      formulaDisplayRef.current?.dispose();
      formulaDisplayRef.current = null;
      if (showFormulaTextRef.current && univerRef.current !== null && activeWorkbookRef.current !== null) {
        formulaDisplayRef.current = registerFormulaTextDisplay(univerRef.current, activeWorkbookRef.current);
      }
    } catch (error) {
      console.error("Failed to update workbook formula display", error);
      setRenderError(error instanceof Error ? error.message : String(error));
    }
  }, [input.showFormulaText]);

  useEffect(() => {
    applySelectedRange(
      activeWorkbookRef.current,
      input.activeSheetId ?? null,
      input.selectedRange ?? null
    );
  }, [
    input.activeSheetId,
    input.selectedRange?.endColumn,
    input.selectedRange?.endRow,
    input.selectedRange?.startColumn,
    input.selectedRange?.startRow
  ]);

  useEffect(() => {
    selectedHighlightRef.current?.dispose();
    selectedHighlightRef.current = null;
    const activeWorkbook = activeWorkbookRef.current;
    if (activeWorkbook === null) return;
    const targetSheet =
      input.activeSheetId == null
        ? activeWorkbook.getActiveSheet()
        : activeWorkbook.getSheetBySheetId(input.activeSheetId);
    if (targetSheet === null) return;
    selectedHighlightRef.current = createSelectedRangeHighlight(
      targetSheet,
      input.selectedKind ?? null,
      input.selectedRange ?? null
    );
  }, [
    input.activeSheetId,
    input.selectedKind,
    input.selectedRange?.endColumn,
    input.selectedRange?.endRow,
    input.selectedRange?.startColumn,
    input.selectedRange?.startRow
  ]);

  useEffect(() => {
    applyControlledSelection({
      activeWorkbook: activeWorkbookRef.current,
      controlledSelection: input.controlledSelection ?? null,
      lastAppliedSelectionKeyRef,
      lastEmittedSelectionKeyRef,
      onSelectionChange: input.onSelectionChange
    });
  }, [input.controlledSelection]);

  useEffect(() => {
    applyControlledScroll({
      controlledScroll: input.controlledScroll ?? null,
      currentWorkbookId: currentWorkbookIdRef.current,
      lastAppliedScrollKeyRef,
      lastEmittedScrollKeyRef,
      univer: univerRef.current
    });
  }, [input.controlledScroll]);

  if (renderError !== null) {
    return (
      <div className="grid h-full content-center justify-items-start gap-3 p-[clamp(28px,6vw,72px)]">
        <p className="m-0 mb-2.5 text-[11px] font-bold uppercase text-desktop-error">
          Renderer error
        </p>
        <h2 className="m-0 max-w-[14ch] text-[clamp(34px,5vw,64px)] font-[640] leading-[0.96] tracking-normal text-desktop-ink">
          Workbook view failed to initialize.
        </h2>
        <p className="m-0 max-w-[60ch] text-[15px] leading-normal text-desktop-muted">
          {renderError}
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full min-h-0 min-w-0"
      data-testid="readonly-workbook-view"
      ref={containerRef}
    />
  );
}

export interface ReadonlyWorkbookControlledSelection extends IRange {
  readonly key: string;
  readonly sheetId: string;
  readonly sourceRole: "base" | "current";
}

export interface ReadonlyWorkbookControlledScroll {
  readonly key: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sheetId: string;
  readonly sheetViewStartColumn: number;
  readonly sheetViewStartRow: number;
  readonly sourceRole: "base" | "current";
}

export interface ReadonlyWorkbookSelectionPayload extends IRange {
  readonly activeCellLabel: string;
  readonly displayValue: string;
  readonly formula: string;
  readonly key: string;
  readonly reason: "initial" | "sheet" | "sync" | "user";
  readonly selectionLabel: string;
  readonly sheetId: string;
}

export interface ReadonlyWorkbookScrollPayload {
  readonly key: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sheetId: string;
  readonly sheetViewStartColumn: number;
  readonly sheetViewStartRow: number;
}

function applySheetGapConfig(input: {
  readonly activeSheetId: string | null;
  readonly gapConfig: WorkbookCompareSheetGapConfig | null;
  readonly renderManagerService: IRenderManagerService;
  readonly workbookId: string;
}): boolean {
  if (input.activeSheetId === null) {
    return true;
  }
  const render = input.renderManagerService.getRenderUnitById(input.workbookId);
  if (render == null) {
    return false;
  }
  const skeleton = render.with(SheetSkeletonManagerService).ensureSkeleton(input.activeSheetId);
  if (skeleton === undefined) {
    return false;
  }
  skeleton.setGapConfig(input.gapConfig ?? {});
  render.scene.makeDirty(true);
  return true;
}

function applySelectedRange(
  activeWorkbook: FWorkbook | null,
  sheetId: string | null,
  range: IRange | null
): void {
  if (activeWorkbook === null || range === null) {
    return;
  }

  const targetSheet =
    sheetId === null ? activeWorkbook.getActiveSheet() : activeWorkbook.getSheetBySheetId(sheetId);
  if (targetSheet === null) {
    return;
  }

  targetSheet.activate();
  targetSheet.setActiveSelection(readFacadeRange(targetSheet, range));
}

function createSelectedRangeHighlight(
  sheet: FWorksheet,
  kind: WorkbookCompareRangeHighlight["kind"] | null,
  range: IRange | null
): IDisposable | null {
  if (kind === null || range === null) return null;
  const visibleRange = getIntersectRange(range, {
    startRow: 0,
    startColumn: 0,
    endRow: sheet.getMaxRows() - 1,
    endColumn: sheet.getMaxColumns() - 1
  });
  if (visibleRange == null) return null;
  const color =
    kind === "delete" ? "rgba(220,38,38,0.86)" :
    kind === "insert" ? "rgba(22,163,74,0.86)" :
    "rgba(37,99,235,0.86)";
  const fill =
    kind === "delete" ? "rgba(239,68,68,0.40)" :
    kind === "insert" ? "rgba(34,197,94,0.40)" :
    "rgba(59,130,246,0.36)";
  const facadeRange = sheet.getRange(
    visibleRange.startRow,
    visibleRange.startColumn,
    visibleRange.endRow - visibleRange.startRow + 1,
    visibleRange.endColumn - visibleRange.startColumn + 1
  );
  return sheet.highlightRanges([facadeRange], {
    fill,
    stroke: color,
    strokeWidth: 3,
    widgetSize: 0
  });
}

function applyControlledSelection(input: {
  activeWorkbook: FWorkbook | null;
  controlledSelection: ReadonlyWorkbookControlledSelection | null;
  lastAppliedSelectionKeyRef: MutableRefObject<string | null>;
  lastEmittedSelectionKeyRef: MutableRefObject<string | null>;
  onSelectionChange: ((payload: ReadonlyWorkbookSelectionPayload) => void) | undefined;
}): void {
  const selection = input.controlledSelection;
  if (input.activeWorkbook === null || selection === null) {
    return;
  }
  if (
    input.lastAppliedSelectionKeyRef.current === selection.key ||
    input.lastEmittedSelectionKeyRef.current === selection.key
  ) {
    return;
  }

  input.lastAppliedSelectionKeyRef.current = selection.key;
  applySelectedRange(input.activeWorkbook, selection.sheetId, selection);
  const payload = readSelectionPayload(input.activeWorkbook, "sync");
  if (payload !== null) {
    input.lastEmittedSelectionKeyRef.current = payload.key;
    input.onSelectionChange?.(payload);
  }
}

function applyControlledScroll(input: {
  controlledScroll: ReadonlyWorkbookControlledScroll | null;
  currentWorkbookId: string | null;
  lastAppliedScrollKeyRef: MutableRefObject<string | null>;
  lastEmittedScrollKeyRef: MutableRefObject<string | null>;
  univer: Univer | null;
}): void {
  const scroll = input.controlledScroll;
  if (input.univer === null || input.currentWorkbookId === null || scroll === null) {
    return;
  }
  if (
    input.lastAppliedScrollKeyRef.current === scroll.key ||
    input.lastEmittedScrollKeyRef.current === scroll.key
  ) {
    return;
  }

  const commandService = input.univer.__getInjector().get(ICommandService);
  input.lastAppliedScrollKeyRef.current = scroll.key;
  commandService.syncExecuteCommand(SetScrollOperation.id, {
    unitId: input.currentWorkbookId,
    sheetId: scroll.sheetId,
    offsetX: scroll.offsetX,
    offsetY: scroll.offsetY,
    sheetViewStartColumn: scroll.sheetViewStartColumn,
    sheetViewStartRow: scroll.sheetViewStartRow
  });
}

function attachReadonlyPaneEvents(input: {
  activeWorkbook: FWorkbook;
  lastEmittedSelectionKeyRef: MutableRefObject<string | null>;
  onSelectionChange: ((payload: ReadonlyWorkbookSelectionPayload) => void) | undefined;
  selectionService: SheetsSelectionsService;
}): Array<() => void> {
  const disposables: Array<{ dispose: () => void }> = [];

  const emitSelection = (reason: ReadonlyWorkbookSelectionPayload["reason"]): void => {
    const payload = readSelectionPayload(input.activeWorkbook, reason);
    if (payload === null) {
      return;
    }
    input.lastEmittedSelectionKeyRef.current = payload.key;
    input.onSelectionChange?.(payload);
  };

  const selectionSubscription = input.selectionService.selectionMoveEnd$.subscribe(() => {
    emitSelection("user");
  });
  disposables.push({
    dispose: () => {
      selectionSubscription.unsubscribe();
    }
  });
  const activeSheetSubscription = input.activeWorkbook
    .getWorkbook()
    .activeSheet$.subscribe(() => {
      emitSelection("sheet");
    });
  disposables.push({
    dispose: () => {
      activeSheetSubscription.unsubscribe();
    }
  });
  emitSelection("initial");
  return disposables.map((disposable) => () => {
    disposable.dispose();
  });
}

function emitScrollPayload(
  input: {
    readonly lastAppliedScrollKeyRef: MutableRefObject<string | null>;
    readonly lastEmittedScrollKeyRef: MutableRefObject<string | null>;
    readonly onScrollChange: ((payload: ReadonlyWorkbookScrollPayload) => void) | undefined;
  },
  worksheet: FWorksheet,
  scrollState: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly sheetViewStartColumn: number;
    readonly sheetViewStartRow: number;
  }
): void {
  const key = [
    worksheet.getSheetId(),
    scrollState.sheetViewStartRow,
    scrollState.sheetViewStartColumn,
    scrollState.offsetX,
    scrollState.offsetY
  ].join(":");
  if (input.lastAppliedScrollKeyRef.current !== null) {
    input.lastAppliedScrollKeyRef.current = null;
    input.lastEmittedScrollKeyRef.current = key;
    return;
  }
  if (input.lastEmittedScrollKeyRef.current === key) {
    return;
  }
  input.lastEmittedScrollKeyRef.current = key;
  input.onScrollChange?.({
    key,
    offsetX: scrollState.offsetX,
    offsetY: scrollState.offsetY,
    sheetId: worksheet.getSheetId(),
    sheetViewStartColumn: scrollState.sheetViewStartColumn,
    sheetViewStartRow: scrollState.sheetViewStartRow
  });
}

function readSelectionPayload(
  workbook: FWorkbook,
  reason: ReadonlyWorkbookSelectionPayload["reason"]
): ReadonlyWorkbookSelectionPayload | null {
  const activeSheet = workbook.getActiveSheet();
  const activeRange = workbook.getActiveRange();
  const activeCell = workbook.getActiveCell();
  const currentCellRange = activeCell?.getRange();
  const selectionRange = activeRange?.getRange() ?? currentCellRange;

  if (activeSheet == null || currentCellRange == null || selectionRange == null) {
    return null;
  }

  const activeCellLabel = formatCellAddress(
    currentCellRange.startRow,
    currentCellRange.startColumn
  );
  const selectionLabel = formatSelectionLabel(selectionRange);
  const key = [
    activeSheet.getSheetId(),
    selectionRange.startRow,
    selectionRange.startColumn,
    selectionRange.endRow,
    selectionRange.endColumn,
    currentCellRange.startRow,
    currentCellRange.startColumn
  ].join(":");
  const activeCellValue = activeSheet.getRange(
    currentCellRange.startRow,
    currentCellRange.startColumn
  );
  const formula = String(activeCellValue.getFormula() ?? "");
  const displayValue = stringifyCellDisplayValue(activeCellValue.getDisplayValue());

  return {
    activeCellLabel,
    displayValue,
    endColumn: selectionRange.endColumn,
    endRow: selectionRange.endRow,
    formula,
    key,
    reason,
    selectionLabel,
    sheetId: activeSheet.getSheetId(),
    startColumn: selectionRange.startColumn,
    startRow: selectionRange.startRow
  };
}

function stringifyCellDisplayValue(value: unknown): string {
  return value == null ? "" : typeof value === "string" ? value : String(value);
}

function formatSelectionLabel(range: IRange): string {
  const start = formatCellAddress(range.startRow, range.startColumn);
  const end = formatCellAddress(range.endRow, range.endColumn);
  return start === end ? start : `${start}:${end}`;
}

function formatCellAddress(row: number, column: number): string {
  let columnIndex = column + 1;
  let label = "";
  while (columnIndex > 0) {
    const remainder = (columnIndex - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    columnIndex = Math.floor((columnIndex - 1) / 26);
  }
  return `${label}${row + 1}`;
}

function readFacadeRange(targetSheet: FWorksheet, range: IRange) {
  return targetSheet.getRange(
    range.startRow,
    range.startColumn,
    Math.max(1, range.endRow - range.startRow + 1),
    Math.max(1, range.endColumn - range.startColumn + 1)
  );
}

function applySelectionRangeInteractionGuards(
  selectionRenderService: ISheetSelectionRenderService
): Array<() => void> {
  const interceptPoints = selectionRenderService.interceptor.getInterceptPoints();
  const disposeRangeMove = selectionRenderService.interceptor.intercept(
    interceptPoints.RANGE_MOVE_PERMISSION_CHECK,
    {
      ...interceptPoints.RANGE_MOVE_PERMISSION_CHECK,
      handler: () => false,
      priority: 1_000
    }
  );
  const disposeRangeFill = selectionRenderService.interceptor.intercept(
    interceptPoints.RANGE_FILL_PERMISSION_CHECK,
    {
      ...interceptPoints.RANGE_FILL_PERMISSION_CHECK,
      handler: () => false,
      priority: 1_000
    }
  );

  return [disposeRangeMove, disposeRangeFill];
}

function readSelectionRenderService(
  renderManagerService: IRenderManagerService,
  workbookId: string
): ISheetSelectionRenderService | null {
  try {
    return (
      renderManagerService.getRenderUnitById(workbookId)?.with(ISheetSelectionRenderService) ?? null
    );
  } catch {
    return null;
  }
}

function createReadonlyDesktopUniver(
  container: HTMLElement,
  input: { readonly footer: boolean; readonly locale: LocaleType; readonly localePack: ILanguagePack }
): Univer {
  const univer = new Univer({
    locale: input.locale,
    locales: { [input.locale]: input.localePack },
    logLevel: LogLevel.WARN
  });

  container.id ||= `readonly-workbook-${Math.random().toString(36).slice(2)}`;
  registerViewRendering(univer, {
    container: container.id,
    assetIoOwner: ViewAssetIoOwner.Local,
    license: TEST_LICENSE,
    workbenchChrome: input.footer ? "visible" : "hidden",
    // Native table anchors include hover-to-insert row/column buttons, not comments.
    sheetTableUI: { hideAnchor: true },
    unitType: UniverInstanceType.UNIVER_SHEET
  });

  return univer;
}
