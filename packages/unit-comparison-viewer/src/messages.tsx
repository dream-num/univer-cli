import { createContext, useContext, type ReactElement, type ReactNode } from "react";

export interface IUnitComparisonViewerMessages {
  readonly changes: string;
  readonly structuralDiff: string;
  readonly kind: { readonly insert: string; readonly delete: string; readonly update: string };
  readonly entity: (entityType: string) => string;
  readonly entityAt: (entityType: string, index: number) => string;
  readonly changePath: (path: readonly string[]) => string;
  readonly changeValue: (
    entityType: string,
    path: readonly string[],
    value: unknown,
  ) => string | undefined;
  readonly renderFailed: string;
  readonly itemCount: (count: number) => string;
  readonly propertyCount: (count: number) => string;
  readonly moved: string;
  readonly rightCurrentVersion: string;
  readonly revision: (revision: number) => string;
  readonly readOnly: string;
  readonly side: { readonly left: string; readonly right: string };
  readonly changeCount: (count: number) => string;
  readonly changedSlides: string;
  readonly changedBaseTables: string;
  readonly noRawTableChanges: string;
  readonly rawTableData: string;
  readonly baseAlignmentHint: string;
  readonly checkboxState: { readonly checked: string; readonly unchecked: string };
  readonly comparingMaterializedSnapshots: string;
  readonly snapshot: string;
  readonly noStructuralChanges: string;
  readonly notPresent: string;
  readonly workbookTitle: string;
  readonly invalidPayloadTitle: string;
  readonly invalidPayloadBody: string;
  readonly summaryUnavailable: string;
  readonly scopeLabel: string;
  readonly displayModeLabel: string;
  readonly worksheet: string;
  readonly workbook: string;
  readonly content: string;
  readonly formatting: string;
  readonly showFormulas: string;
  readonly searchChanges: string;
  readonly noItems: string;
  readonly selectItemHint: string;
  readonly snapshotUnavailable: string;
  readonly formulaDiff: string;
  readonly baseFormula: string;
  readonly currentFormula: string;
  readonly baseValue: string;
  readonly currentValue: string;
  readonly base: string;
  readonly current: string;
  readonly summaryLabel: string;
  readonly sheetTree: {
    readonly categories: {
      readonly chart: string;
      readonly cell: string;
      readonly conditionFormat: string;
      readonly dataValidation: string;
      readonly move: string;
      readonly pivot: string;
      readonly rowColumn: string;
      readonly shape: string;
      readonly sparkline: string;
      readonly table: string;
      readonly workbook: string;
      readonly worksheet: string;
    };
    readonly emptyText: string;
    readonly noActiveSheet: string;
    readonly noCompareData: string;
    readonly row: (index: number) => string;
    readonly styles: string;
    readonly workbookRoot: string;
    readonly titles: {
      readonly insertedRows: string;
      readonly deletedRows: string;
      readonly insertedColumns: string;
      readonly deletedColumns: string;
      readonly rowsMoved: string;
      readonly columnsMoved: string;
      readonly rowChanged: (index: number) => string;
      readonly columnChanged: (index: number) => string;
      readonly sheetAdded: (name: string) => string;
      readonly sheetDeleted: (name: string) => string;
      readonly sheetRenamed: string;
      readonly workbookRenamed: string;
    };
  };
}

function humanize(value: string): string {
  const spaced = value
    .replaceAll(/[-_]+/gu, " ")
    .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
    .trim();
  return spaced.length === 0 ? "Item" : `${spaced[0]!.toUpperCase()}${spaced.slice(1)}`;
}

export const defaultUnitComparisonViewerMessages: IUnitComparisonViewerMessages = {
  changes: "Changes",
  structuralDiff: "Structural diff",
  kind: { insert: "Added", delete: "Deleted", update: "Modified" },
  entity: humanize,
  entityAt: (entityType, index) => `${humanize(entityType)} ${index}`,
  changePath: (path) => (path.length === 0 ? "Item" : path.map(humanize).join(" · ")),
  changeValue: () => undefined,
  renderFailed: "Failed to render comparison",
  itemCount: (count) => `${count} item${count === 1 ? "" : "s"}`,
  propertyCount: (count) => `${count} propert${count === 1 ? "y" : "ies"}`,
  moved: "Moved",
  rightCurrentVersion: "Right · Current version",
  revision: (revision) => `r${revision}`,
  readOnly: "Read only",
  side: { left: "Left", right: "Right" },
  changeCount: (count) => `${count} changes`,
  changedSlides: "Changed slides",
  changedBaseTables: "Changed Base tables",
  noRawTableChanges: "No raw table data changed.",
  rawTableData: "Raw table data",
  baseAlignmentHint:
    "Fields and records are aligned by stable ID. Other views reuse the same raw-table comparison.",
  checkboxState: { checked: "Checked", unchecked: "Unchecked" },
  comparingMaterializedSnapshots: "Comparing materialized snapshots.",
  snapshot: "Snapshot comparison",
  noStructuralChanges: "No structural changes",
  notPresent: "Not present on this side",
  workbookTitle: "Workbook comparison",
  invalidPayloadTitle: "Comparison payload is invalid",
  invalidPayloadBody: "The target snapshot is missing or cannot be rendered.",
  summaryUnavailable: "No comparison summary is available.",
  scopeLabel: "Comparison scope",
  displayModeLabel: "Comparison display mode",
  worksheet: "Worksheet",
  workbook: "Workbook",
  content: "Content",
  formatting: "Formatting",
  showFormulas: "Show formulas",
  searchChanges: "Search changes",
  noItems: "No comparison items in this scope.",
  selectItemHint: "Select a comparison item to inspect the affected content.",
  snapshotUnavailable: "This snapshot is unavailable for rendering.",
  formulaDiff: "Formula comparison",
  baseFormula: "Base formula",
  currentFormula: "Current formula",
  baseValue: "Base value",
  currentValue: "Current value",
  base: "Base",
  current: "Current",
  summaryLabel: "Comparison summary",
  sheetTree: {
    categories: {
      chart: "Charts",
      cell: "Cells",
      conditionFormat: "Conditional formats",
      dataValidation: "Data validation",
      move: "Moves",
      pivot: "Pivots",
      rowColumn: "Rows and columns",
      shape: "Shapes",
      sparkline: "Sparklines",
      table: "Tables",
      workbook: "Workbook",
      worksheet: "Worksheet",
    },
    emptyText: "(empty)",
    noActiveSheet: "No active sheet",
    noCompareData: "No comparison data",
    row: (index) => `Row ${index}`,
    styles: "Styles",
    workbookRoot: "Workbook",
    titles: {
      insertedRows: "Inserted rows",
      deletedRows: "Deleted rows",
      insertedColumns: "Inserted columns",
      deletedColumns: "Deleted columns",
      rowsMoved: "Rows moved",
      columnsMoved: "Columns moved",
      rowChanged: (index) => `Row ${index} changed`,
      columnChanged: (index) => `Column ${index} changed`,
      sheetAdded: (name) => `Sheet added: ${name}`,
      sheetDeleted: (name) => `Sheet deleted: ${name}`,
      sheetRenamed: "Sheet renamed",
      workbookRenamed: "Workbook renamed",
    },
  },
};

const UnitComparisonMessagesContext = createContext(defaultUnitComparisonViewerMessages);

export function UnitComparisonMessagesProvider(input: {
  readonly children: ReactNode;
  readonly messages?: IUnitComparisonViewerMessages;
}): ReactElement {
  return (
    <UnitComparisonMessagesContext value={input.messages ?? defaultUnitComparisonViewerMessages}>
      {input.children}
    </UnitComparisonMessagesContext>
  );
}

export function useUnitComparisonViewerMessages(): IUnitComparisonViewerMessages {
  return useContext(UnitComparisonMessagesContext);
}
