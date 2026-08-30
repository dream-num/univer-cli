const STRUCTURAL_ENTITY_LABELS: Readonly<Record<string, string>> = {
  paragraph: "Paragraph",
  "text-style": "Text style",
  section: "Section",
  "block-range": "Block range",
  "custom-range": "Custom range",
  "table-range": "Table range",
  "custom-block": "Custom block",
  "column-group": "Column group",
  table: "Table",
  drawing: "Drawing",
  header: "Header",
  footer: "Footer",
  "document-style": "Document style",
  "document-setting": "Document setting",
  "custom-decoration": "Custom decoration",
  "doc-hyperlink": "Hyperlink",
  "doc-callout": "Callout",
  "doc-quote": "Quote",
  "doc-chart": "Chart",
  "doc-chart-data": "Chart data",
  "doc-code": "Code block",
  "doc-latex": "LaTeX formula",
  "doc-shape-resource": "Shape",
  "doc-table-resource": "Table data",
  slide: "Slide",
  "slide-element": "Slide element",
  "slide-transition": "Transition",
  "slide-transition-ref": "Slide transition",
  "slide-master": "Master slide",
  "slide-layout": "Slide layout",
  "slide-theme": "Slide theme",
  "slide-chart": "Chart",
  "slide-chart-data": "Chart data",
  "slide-table": "Table data",
  base: "Base",
  field: "Field",
  record: "Record",
  view: "View",
  cell: "Cell",
  "board-page": "Board page",
  "board-element": "Board element",
  "board-theme": "Board theme",
  "board-chart": "Chart",
  "board-chart-data": "Chart data",
  "board-table": "Table data"
};

const COMPARISON_PATH_LABELS: Readonly<Record<string, string>> = {
  text: "Text",
  value: "Value",
  formula: "Formula",
  name: "Name",
  type: "Type",
  language: "Language",
  config: "Settings",
  columns: "Column layout",
  gap: "Column spacing",
  position: "Position",
  geometry: "Position and size",
  "geometry.x": "Horizontal position",
  "geometry.y": "Vertical position",
  style: "Formatting",
  "style.backgroundColor.rgb": "Background color",
  "style.background": "Background color",
  backgroundColor: "Background color",
  color: "Color",
  width: "Width",
  height: "Height",
  tableRows: "Rows",
  tableCells: "Cells"
};

function comparisonPathLabel(path: readonly string[]): string {
  const exact = COMPARISON_PATH_LABELS[path.join(".")];
  if (exact !== undefined) return exact;
  return path.map((part) => COMPARISON_PATH_LABELS[part] ?? part.replace(/([a-z])([A-Z])/g, "$1 $2")).join(" · ");
}

/** English shell copy; this table is the structural authority for every other language. */
export const EN_US_MESSAGES = {
  app: {
    title: "Collaboration Viewer"
  },
  boot: {
    noFileTitle: "No file specified",
    noFileBody:
      "Add <code>?file=&lt;absolute path to the .univer&gt;</code> to the address bar, e.g.:",
    noFileHint: "To view a modification, also add <code>&amp;worktree=&lt;worktreeId&gt;</code>.",
    notFoundTitle: "univerfile not found",
    notFoundBody:
      "This <code>.univer</code> file does not exist; the service will not create it automatically.",
    notFoundHint: (command: string): string => `Create it first: <code>${command}</code>`,
    fatal: (error: string): string => `Failed to start: ${error}`
  },
  viewer: {
    loading: "Loading…",
    loadFailed: (error: string): string => `Failed to load: ${error}`,
    previewComputeFailed: "Failed to compute the merge preview",
    previewUnitUnrenderable: "This file cannot be rendered in the merge preview",
    previewLoadFailed: (error: string): string => `Failed to load the preview: ${error}`
  },
  toast: {
    worktreeGone: "That modification no longer exists; switched back to the current version",
    agentReset: "The AI undid its last step; refreshing…",
    workDone: (name: string): string => `"${name}" is done and awaiting your confirmation`,
    readyChanged:
      "This modification changed while you were confirming. Review the latest changes and submit it again.",
    mergedElsewhere: "This modification has been merged into the current version",
    discardedElsewhere: "This modification has been discarded",
    previewRefreshed: "The latest version changed; the merge preview has been refreshed",
    readyFailed: (error: string): string => `Failed to submit for confirmation: ${error}`,
    merged: "Merged into the current version",
    mergeFailed: (error: string): string => `Merge failed: ${error}`,
    discardFailed: (error: string): string => `Discard failed: ${error}`,
    conflictsCannotMerge: "There are conflicts; cannot merge"
  },
  sidebar: {
    files: "Files",
    inProgress: "Modifications in progress",
    awaitingConfirm: "Awaiting confirmation",
    none: "None",
    noFiles: "No files",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    tailReady: "awaiting confirmation",
    tailDraft: "in progress",
    worktreeRowSub: (when: string, tail: string): string =>
      `AI assistant${when ? ` · ${when}` : ""} · ${tail}`
  },
  status: {
    draft: "Editing",
    ready: "Ready",
    merged: "Merged",
    discarded: "Discarded"
  },
  change: {
    modified: "M",
    added: "A",
    deleted: "D",
    conflict: "Conflict",
    updated: "Updated"
  },
  topbar: {
    currentVersion: "Current version",
    fallbackWorktreeName: "A modification",
    submitForReview: "Submit for confirmation",
    mergeToCurrent: "Merge into current version",
    discard: "Discard",
    previewUnavailable: "Merge preview unavailable · viewing the original edits",
    conflictCount: (n: number): string =>
      `${n} conflict${n === 1 ? "" : "s"}, cannot merge automatically`,
    divergedShowingPreview: "The latest version has changed · showing the merged result",
    divergedShowingOriginal: "The latest version has changed · viewing the original edits",
    segPreview: "Merge preview",
    segOriginal: "Original edits",
    viewOnly: "View only",
    editable: "Editable",
    editingPending: (n: number): string => `Editing · ${n} unmerged`,
    lockedPending: (n: number): string => `Locked · ${n} unmerged`,
    stopEditing: "Stop editing",
    editAnyway: "Edit anyway",
    segView: "View",
    segDiff: "Compare",
    comparisonSource: "Left · compare with",
    trunk: "Main",
    refreshComparison: "Refresh"
  },
  diff: {
    compare: "Compare",
    changes: "Changes",
    structuralDiff: "Structural diff",
    kind: { insert: "Added", delete: "Deleted", update: "Modified" },
    entity: (category: string): string =>
      STRUCTURAL_ENTITY_LABELS[category.split(":")[0] ?? ""] ?? "Content",
    entityAt: (category: string, index: number): string =>
      `${STRUCTURAL_ENTITY_LABELS[category.split(":")[0] ?? ""] ?? "Content"} ${index}`,
    changePath: comparisonPathLabel,
    wholeItem: "Entire item",
    present: "Present",
    itemCount: (count: number): string => `${count} item${count === 1 ? "" : "s"}`,
    propertyCount: (count: number): string => `${count} propert${count === 1 ? "y" : "ies"}`,
    moved: "Moved",
    rightCurrentVersion: "Right · Current version",
    revision: (revision: number): string => `r${revision}`,
    readOnly: "Read only",
    side: { left: "Left", right: "Right" },
    changeCount: (count: number): string => `${count} changes`,
    changedSlides: "Changed slides",
    changedBaseTables: "Changed Base tables",
    noRawTableChanges: "No raw table data changed.",
    rawTableData: "Raw table data",
    baseAlignmentHint:
      "Fields and records are aligned by stable ID. Grid, Kanban, Calendar, and other views reuse the same raw-table comparison.",
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
    searchChanges: "Search changes",
    noItems: "No comparison items in this scope.",
    selectItemHint: "Select a comparison item to inspect the affected sheet content.",
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
        worksheet: "Worksheet"
      },
      emptyText: "(empty)",
      noActiveSheet: "No active sheet",
      noCompareData: "No comparison data",
      row: (index: number): string => `Row ${index}`,
      styles: "Styles",
      workbookRoot: "Workbook",
      terms: {
        formula: "Formula",
        value: "Value",
        start: "Start",
        count: "Count",
        position: "Position",
        name: "Name",
        background: "Background",
        bold: "Bold",
        textColor: "Text color",
        fontSize: "Font size",
        italic: "Italic",
        numberFormat: "Number format"
      },
      titles: {
        insertedRows: "Inserted rows",
        deletedRows: "Deleted rows",
        insertedColumns: "Inserted columns",
        deletedColumns: "Deleted columns",
        rowsMoved: "Rows moved",
        columnsMoved: "Columns moved",
        rowChanged: (index: number): string => `Row ${index} changed`,
        columnChanged: (index: number): string => `Column ${index} changed`,
        sheetAdded: (name: string): string => `Sheet added: ${name}`,
        sheetDeleted: (name: string): string => `Sheet deleted: ${name}`,
        sheetRenamed: "Sheet renamed",
        workbookRenamed: "Workbook renamed"
      }
    }
  },
  settings: {
    title: "Settings",
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    language: "Language",
    loadingLanguage: "Loading language…",
    languageLoadFailed: "Could not load that language"
  },
  community: {
    joinDiscord: "Join the Discord community"
  },
  modal: {
    cancel: "Cancel",
    gotIt: "Got it",
    conflictTitle: "Cannot merge automatically",
    conflictBody: (unitHtml: string): string =>
      `The file "<strong>${unitHtml}</strong>" was also changed elsewhere and the current version has advanced, so this modification cannot be merged automatically.<br><span class="muted">It has been kept as "awaiting confirmation"; the current version is untouched. You can ask the AI assistant to redo it against the latest version and retry, or discard it.</span>`,
    readyTitle: "Submit this modification for confirmation?",
    readyBody: (name: string): string =>
      `"${name}" will move to <strong>awaiting confirmation</strong>, where you can merge or discard it. Further editing is blocked until you explicitly reopen it.`,
    readyConfirm: "Submit for confirmation",
    mergeTitle: "Merge this modification?",
    mergeBody: (name: string): string =>
      `"${name}" will be merged into the <strong>current version</strong>. After merging, everyone will see the modified data in the current version.`,
    mergeConfirm: "Merge",
    discardTitle: "Discard this modification?",
    discardBody: (name: string): string =>
      `"${name}" will be <strong>permanently deleted and cannot be recovered</strong>. The current version is not affected.`,
    discardChip: "All of the AI assistant's changes will be removed",
    discardConfirm: "Discard",
    trunkEditTitle: "Edit while modifications are still unmerged?",
    trunkEditBody: (n: number): string =>
      `There ${n === 1 ? "is" : "are"} <strong>${n}</strong> unmerged modification${n === 1 ? "" : "s"} (the AI assistant is editing or awaiting confirmation). Editing the <strong>current version</strong> now is fine, but if you touch the places they are changing, those modifications <strong>may conflict when merged</strong> and need redoing or manual resolution.`,
    trunkEditChip:
      "Safer: merge or discard those modifications first, then edit the current version",
    trunkEditConfirm: "Edit anyway"
  },
  time: {
    justNow: "just now",
    minutesAgo: (n: number): string => `${n} min ago`,
    hoursAgo: (n: number): string => `${n} h ago`,
    daysAgo: (n: number): string => `${n} d ago`
  },
  content: {
    emptyTitle: "No file open",
    emptyHint:
      "Pick a file from the sidebar to view it, or wait for the AI assistant's changes to land for review."
  },
  summary: {
    modified: (n: number): string => `${n} modified`,
    added: (n: number): string => `${n} added`,
    deleted: (n: number): string => `${n} deleted`,
    noChanges: "No changes yet"
  }
};

export type Messages = typeof EN_US_MESSAGES;
