import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
} from "@univer/collab-gateway-contract";
import { lazy, Suspense, type ReactElement } from "react";
import { structuralDiffItemsFromContext } from "./comparison-presentation";
import { t } from "../i18n";
import { BaseTableDiffViewer } from "./base/base-comparison-view";
import type {
  BaseComparisonViewerValue,
  IUnitComparisonViewerProps,
  NativeComparisonViewerValue,
  SheetComparisonViewerValue,
} from "./comparison-types";
import { NativeComparisonView } from "./native/native-comparison-view";

const WorkbookDiffViewer = lazy(async () => {
  const module = await import("./sheet/sheet-comparison-view");
  return { default: module.WorkbookDiffViewer };
});

export type {
  IUnitComparisonUniverFactoryOptions,
  IUnitComparisonUniverInstance,
  IUnitComparisonViewerProps,
  IUnitComparisonViewerSide,
  UnitComparisonUniverFactory,
  UnitComparisonViewerValue,
} from "./comparison-types";

export function UnitComparisonViewer(props: IUnitComparisonViewerProps): ReactElement {
  const { comparison } = props;
  switch (comparison.result.unit.type) {
    case UNIT_TYPE_SHEET:
      return renderSheetComparison(props, comparison as SheetComparisonViewerValue);
    case UNIT_TYPE_BASE:
      return renderBaseComparison(props, comparison as BaseComparisonViewerValue);
    case UNIT_TYPE_DOC:
    case UNIT_TYPE_SLIDE:
    case UNIT_TYPE_BOARD:
      return (
        <NativeComparisonView
          comparison={comparison as NativeComparisonViewerValue}
          createUniver={props.createUniver}
          darkMode={props.darkMode}
          leftHeaderControl={props.leftHeaderControl}
          locale={props.locale}
        />
      );
    default:
      throw new Error("Unsupported comparison unit type");
  }
}

function renderSheetComparison(
  props: IUnitComparisonViewerProps,
  comparison: SheetComparisonViewerValue,
): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-2">
      <Suspense fallback={<div className="h-full" />}>
        <WorkbookDiffViewer
          createUniver={props.createUniver}
          darkMode={props.darkMode}
          leftSourceControl={props.leftHeaderControl}
          locale={props.locale}
          unitLabel={comparison.result.unit.name}
          compare={{
            leftLabel: comparisonSideLabel(comparison.left),
            leftWorkbookData: comparison.left.unitData,
            rightLabel: comparisonSideLabel(comparison.right),
            rightWorkbookData: comparison.right.unitData,
            context: comparison.result,
            ...(comparison.result.fidelity === "snapshot"
              ? { degradedReason: t().diff.comparingMaterializedSnapshots }
              : {}),
          }}
        />
      </Suspense>
    </div>
  );
}

function renderBaseComparison(
  props: IUnitComparisonViewerProps,
  comparison: BaseComparisonViewerValue,
): ReactElement {
  return (
    <BaseTableDiffViewer
      fidelity={comparison.result.fidelity}
      items={structuralDiffItemsFromContext(comparison.result)}
      left={comparison.left.unitData}
      leftLabel={comparisonSideLabel(comparison.left)}
      leftSourceControl={props.leftHeaderControl}
      right={comparison.right.unitData}
      rightLabel={comparisonSideLabel(comparison.right)}
    />
  );
}

function comparisonSideLabel(side: { readonly label: string; readonly revision?: number }): string {
  return side.revision === undefined
    ? side.label
    : `${side.label} · ${t().diff.revision(side.revision)}`;
}
