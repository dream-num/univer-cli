import type { Messages } from "./en-US";
import type { Lang } from "../index.js";
import {
  comparisonTerm,
  localizedComparisonEntity,
  localizedComparisonEnum,
  localizedComparisonPath,
  type UnitComparisonLocalePack
} from "./comparison-labels.js";

export interface MessageVocabulary {
  title: string;
  file: string;
  modification: string;
  compare: string;
  workbook: string;
  worksheet: string;
  content: string;
  formatting: string;
  showFormulas: string;
  search: string;
  row: string;
  styles: string;
  sheetCategories: {
    chart: string;
    cell: string;
    conditionFormat: string;
    dataValidation: string;
    move: string;
    pivot: string;
    rowColumn: string;
    shape: string;
    sparkline: string;
    table: string;
    formula: string;
    value: string;
    start: string;
    count: string;
    position: string;
    name: string;
    background: string;
    bold: string;
    textColor: string;
    fontSize: string;
    italic: string;
    numberFormat: string;
    column: string;
    inserted: string;
    deleted: string;
    moved: string;
    changed: string;
    sheet: string;
    renamed: string;
  };
  currentVersion: string;
  aiAssistant: string;
  no: string;
  create: string;
  start: string;
  load: string;
  loading: string;
  failed: string;
  preview: string;
  merge: string;
  discard: string;
  conflict: string;
  updated: string;
  editing: string;
  ready: string;
  readyChanged: string;
  readyFailed: (error: string) => string;
  submitForReview: string;
  readyTitle: string;
  readyBody: (name: string) => string;
  readyConfirm: string;
  merged: string;
  discarded: string;
  files: string;
  inProgress: string;
  awaiting: string;
  collapse: string;
  expand: string;
  settings: string;
  appearance: string;
  light: string;
  dark: string;
  language: string;
  joinDiscord: string;
  cancel: string;
  confirm: string;
  viewOnly: string;
  editable: string;
  locked: string;
  stop: string;
  continue: string;
  latestChanged: string;
  permanent: string;
  justNow: string;
  minute: string;
  hour: string;
  day: string;
  choose: string;
  cannot: string;
  empty: string;
}

// Worktree language belongs to this application, not to the SDK comparison vocabulary.
const WORKTREE_MAIN_BRANCH: Readonly<Record<Lang, string>> = {
  "ca-ES": "Branca principal",
  "de-DE": "Hauptbranch",
  "en-US": "Main branch",
  "es-ES": "Rama principal",
  "fr-FR": "Branche principale",
  "id-ID": "Cabang utama",
  "it-IT": "Ramo principale",
  "ja-JP": "メインブランチ",
  "ko-KR": "메인 브랜치",
  "pl-PL": "Gałąź główna",
  "pt-BR": "Branch principal",
  "ru-RU": "Основная ветка",
  "sk-SK": "Hlavná vetva",
  "vi-VN": "Nhánh chính",
  "zh-CN": "主分支",
  "zh-HK": "主分支",
  "zh-TW": "主分支"
};

/** Build a structurally complete shell table from locale-owned vocabulary, without English fallback. */
export function messagesFromVocabulary(
  v: MessageVocabulary,
  locale: Lang,
  comparisonLocale: UnitComparisonLocalePack
): Messages {
  const failure = (action: string, error: string): string => `${action} ${v.failed}: ${error}`;
  const ago = (n: number, unit: string): string => `${n} ${unit}`;
  const structuralEntity = (category: string): string =>
    localizedComparisonEntity(comparisonLocale, category);
  return {
    app: { title: v.title },
    boot: {
      noFileTitle: `${v.no} ${v.file}`,
      noFileBody: `${v.choose} <code>?file=&lt;${v.file}&gt;</code>`,
      noFileHint: `${v.preview} ${v.modification}: <code>&amp;worktree=&lt;worktreeId&gt;</code>.`,
      notFoundTitle: `${v.file}: ${v.no}`,
      notFoundBody: `<code>.univer</code> ${v.file}: ${v.no}.`,
      notFoundHint: (command) => `${v.create}: <code>${command}</code>`,
      fatal: (error) => failure(v.start, error)
    },
    viewer: {
      loading: `${v.loading}…`,
      loadFailed: (error) => failure(v.load, error),
      previewComputeFailed: `${v.preview} ${v.failed}`,
      previewUnitUnrenderable: `${v.preview}: ${v.cannot}`,
      previewLoadFailed: (error) => failure(v.preview, error)
    },
    toast: {
      worktreeGone: `${v.modification}: ${v.no} · ${v.currentVersion}`,
      agentReset: `${v.aiAssistant}: ${v.updated} · ${v.loading}…`,
      workDone: (name) => `“${name}” · ${v.ready}`,
      readyChanged: v.readyChanged,
      readyFailed: v.readyFailed,
      mergedElsewhere: `${v.modification}: ${v.merged}`,
      discardedElsewhere: `${v.modification}: ${v.discarded}`,
      previewRefreshed: `${v.latestChanged} · ${v.preview}: ${v.updated}`,
      merged: `${v.merged} · ${v.currentVersion}`,
      mergeFailed: (error) => failure(v.merge, error),
      discardFailed: (error) => failure(v.discard, error),
      conflictsCannotMerge: `${v.conflict} · ${v.cannot} ${v.merge}`
    },
    sidebar: {
      files: v.files,
      inProgress: `${v.modification} · ${v.inProgress}`,
      awaitingConfirm: `${v.modification} · ${v.awaiting}`,
      none: v.no,
      noFiles: `${v.no} ${v.files}`,
      collapse: v.collapse,
      expand: v.expand,
      tailReady: v.awaiting,
      tailDraft: v.inProgress,
      worktreeRowSub: (when, tail) => `${v.aiAssistant}${when ? ` · ${when}` : ""} · ${tail}`
    },
    status: { draft: v.editing, ready: v.ready, merged: v.merged, discarded: v.discarded },
    change: {
      modified: v.updated,
      added: v.create,
      deleted: v.discarded,
      conflict: v.conflict,
      updated: v.updated
    },
    topbar: {
      currentVersion: v.currentVersion,
      fallbackWorktreeName: v.modification,
      submitForReview: v.submitForReview,
      mergeToCurrent: `${v.merge} · ${v.currentVersion}`,
      discard: v.discard,
      previewUnavailable: `${v.preview}: ${v.cannot}`,
      conflictCount: (n) => `${n} ${v.conflict} · ${v.cannot} ${v.merge}`,
      divergedShowingPreview: `${v.latestChanged} · ${v.preview}`,
      divergedShowingOriginal: `${v.latestChanged} · ${v.modification}`,
      segPreview: v.preview,
      segOriginal: v.modification,
      viewOnly: v.viewOnly,
      editable: v.editable,
      editingPending: (n) => `${v.editing} · ${n} ${v.awaiting}`,
      lockedPending: (n) => `${v.locked} · ${n} ${v.awaiting}`,
      stopEditing: `${v.stop} ${v.editing}`,
      editAnyway: `${v.continue} ${v.editing}`,
      segView: v.viewOnly,
      segDiff: v.compare,
      comparisonSource: `${comparisonTerm(comparisonLocale, "left")} · ${comparisonTerm(comparisonLocale, "source")}`,
      trunk: WORKTREE_MAIN_BRANCH[locale],
      refreshComparison: `${v.modification} · ${v.updated}`
    },
    diff: {
      compare: v.compare,
      changes: v.modification,
      structuralDiff: `${v.compare} · ${v.content}`,
      kind: { insert: v.sheetCategories.inserted, delete: v.sheetCategories.deleted, update: v.sheetCategories.changed },
      entity: structuralEntity,
      entityAt: (category, index) => `${structuralEntity(category)} ${index}`,
      changePath: (path) => localizedComparisonPath(comparisonLocale, path, (part) => ({
        start: v.sheetCategories.start, count: v.sheetCategories.count, row: v.row,
        name: v.sheetCategories.name,
        "style.n": v.sheetCategories.numberFormat,
        formulaName: `${v.sheetCategories.formula} · ${v.sheetCategories.name}`,
        value: v.sheetCategories.value,
        rowCount: `${v.row} · ${v.sheetCategories.count}`,
        columnCount: `${v.sheetCategories.column} · ${v.sheetCategories.count}`,
        columns: v.sheetCategories.column,
        h: comparisonTerm(comparisonLocale, "rowHeight"), w: comparisonTerm(comparisonLocale, "columnWidth"),
        hd: comparisonTerm(comparisonLocale, "hidden"), ia: comparisonTerm(comparisonLocale, "automaticHeight"),
        bg: v.sheetCategories.background, rgb: v.sheetCategories.textColor,
        cl: v.sheetCategories.textColor, fs: v.sheetCategories.fontSize,
        bl: v.sheetCategories.bold, it: v.sheetCategories.italic,
        geometry: v.sheetCategories.position, transform: v.sheetCategories.position,
        left: v.sheetCategories.position, top: v.sheetCategories.position, angle: v.sheetCategories.position,
        range: v.sheetCategories.position, ranges: v.sheetCategories.position, rangeInfo: v.sheetCategories.position,
        startRow: `${v.row} · ${v.sheetCategories.start}`, endRow: `${v.row} · ${v.sheetCategories.position}`,
        startColumn: `${v.sheetCategories.column} · ${v.sheetCategories.start}`, endColumn: `${v.sheetCategories.column} · ${v.sheetCategories.position}`,
        sparklines: v.sheetCategories.sparkline, fieldsConfig: v.sheetCategories.pivot,
        text: v.content,
        formula: v.sheetCategories.formula,
        position: v.sheetCategories.position,
        style: v.styles,
        background: v.sheetCategories.background,
        bold: v.sheetCategories.bold,
        italic: v.sheetCategories.italic
      })[part]),
      changeValue: (entityType, path, value) => localizedComparisonEnum(comparisonLocale, entityType, path, value),
      renderFailed: comparisonTerm(comparisonLocale, "loadFailed"),
      comparisonFailed: comparisonTerm(comparisonLocale, "comparisonFailed"),
      incompletePage: comparisonTerm(comparisonLocale, "incompletePage"),
      wholeItem: v.content,
      present: v.content,
      itemCount: (count) => `${count} ${comparisonTerm(comparisonLocale, "item")}`,
      propertyCount: (count) => `${count} ${comparisonTerm(comparisonLocale, "property")}`,
      moved: v.sheetCategories.moved,
      rightCurrentVersion: `${comparisonTerm(comparisonLocale, "right")} · ${v.currentVersion}`,
      revision: (revision) => `${comparisonTerm(comparisonLocale, "revision")} ${revision}`,
      readOnly: comparisonTerm(comparisonLocale, "readOnly"),
      side: {
        left: comparisonTerm(comparisonLocale, "left"),
        right: comparisonTerm(comparisonLocale, "right")
      },
      changeCount: (count) => `${count} ${v.modification}`,
      changedSlides: `${v.modification} · ${v.file}`,
      changedBaseTables: `${v.modification} · ${v.sheetCategories.table}`,
      noRawTableChanges: `${v.no} ${v.sheetCategories.table} ${v.modification}`,
      rawTableData: `${v.sheetCategories.table} · ${v.content}`,
      baseAlignmentHint: comparisonTerm(comparisonLocale, "stableAlignment"),
      checkboxState: {
        checked: comparisonTerm(comparisonLocale, "checked"),
        unchecked: comparisonTerm(comparisonLocale, "unchecked")
      },
      comparingMaterializedSnapshots: `${v.preview} · ${v.compare}`,
      snapshot: `${v.preview} · ${v.compare}`,
      noStructuralChanges: `${v.no} ${v.modification}`,
      notPresent: `${v.no} ${v.file}`,
      workbookTitle: `${v.workbook} · ${v.compare}`,
      invalidPayloadTitle: `${v.compare} · ${v.failed}`,
      invalidPayloadBody: `${v.preview}: ${v.cannot}`,
      summaryUnavailable: `${v.no} ${v.compare}`,
      scopeLabel: `${v.compare} · ${v.choose}`,
      displayModeLabel: `${v.compare} · ${v.content}`,
      worksheet: v.worksheet,
      workbook: v.workbook,
      content: v.content,
      formatting: v.formatting,
      showFormulas: v.showFormulas,
      searchChanges: `${v.search} ${v.modification}`,
      noItems: `${v.no} ${v.modification}`,
      selectItemHint: `${v.choose} ${v.modification}`,
      snapshotUnavailable: `${v.preview}: ${v.cannot}`,
      formulaDiff: `${v.compare} · ${v.sheetCategories.formula}`,
      baseFormula: `${v.currentVersion} · ${v.sheetCategories.formula}`,
      currentFormula: `${v.modification} · ${v.sheetCategories.formula}`,
      baseValue: `${v.currentVersion} · ${v.content}`,
      currentValue: `${v.modification} · ${v.content}`,
      base: v.currentVersion,
      current: v.modification,
      summaryLabel: `${v.compare} · ${v.modification}`,
      sheetTree: {
        categories: {
          chart: v.sheetCategories.chart,
          cell: v.sheetCategories.cell,
          conditionFormat: v.sheetCategories.conditionFormat,
          dataValidation: v.sheetCategories.dataValidation,
          move: v.sheetCategories.move,
          pivot: v.sheetCategories.pivot,
          rowColumn: v.sheetCategories.rowColumn,
          shape: v.sheetCategories.shape,
          sparkline: v.sheetCategories.sparkline,
          table: v.sheetCategories.table,
          workbook: v.workbook,
          worksheet: v.worksheet
        },
        emptyText: `(${v.empty})`,
        noActiveSheet: `${v.no} ${v.worksheet}`,
        noCompareData: `${v.no} ${v.compare}`,
        row: (index) => `${v.row} ${index}`,
        styles: v.styles,
        workbookRoot: v.workbook,
        terms: {
          formula: v.sheetCategories.formula,
          value: v.sheetCategories.value,
          start: v.sheetCategories.start,
          count: v.sheetCategories.count,
          position: v.sheetCategories.position,
          name: v.sheetCategories.name,
          background: v.sheetCategories.background,
          bold: v.sheetCategories.bold,
          textColor: v.sheetCategories.textColor,
          fontSize: v.sheetCategories.fontSize,
          italic: v.sheetCategories.italic,
          numberFormat: v.sheetCategories.numberFormat
        },
        titles: {
          insertedRows: `${v.sheetCategories.inserted} ${v.row}`,
          deletedRows: `${v.sheetCategories.deleted} ${v.row}`,
          insertedColumns: `${v.sheetCategories.inserted} ${v.sheetCategories.column}`,
          deletedColumns: `${v.sheetCategories.deleted} ${v.sheetCategories.column}`,
          rowsMoved: `${v.row} · ${v.sheetCategories.moved}`,
          columnsMoved: `${v.sheetCategories.column} · ${v.sheetCategories.moved}`,
          rowChanged: (index) => `${v.row} ${index} · ${v.sheetCategories.changed}`,
          columnChanged: (index) =>
            `${v.sheetCategories.column} ${index} · ${v.sheetCategories.changed}`,
          sheetAdded: (name) => `${v.sheetCategories.inserted} ${v.sheetCategories.sheet}: ${name}`,
          sheetDeleted: (name) => `${v.sheetCategories.deleted} ${v.sheetCategories.sheet}: ${name}`,
          sheetRenamed: `${v.sheetCategories.sheet} · ${v.sheetCategories.renamed}`,
          workbookRenamed: `${v.workbook} · ${v.sheetCategories.renamed}`
        }
      }
    },
    settings: {
      title: v.settings,
      appearance: v.appearance,
      light: v.light,
      dark: v.dark,
      language: v.language,
      loadingLanguage: `${v.loading} ${v.language}…`,
      languageLoadFailed: `${v.language} ${v.failed}`
    },
    community: {
      joinDiscord: v.joinDiscord
    },
    modal: {
      cancel: v.cancel,
      gotIt: v.confirm,
      conflictTitle: `${v.cannot} ${v.merge}`,
      conflictBody: (unitHtml) =>
        `<strong>${unitHtml}</strong>: ${v.conflict}. <span class="muted">${v.modification} · ${v.awaiting}; ${v.currentVersion} · ${v.updated}.</span>`,
      readyTitle: v.readyTitle,
      readyBody: v.readyBody,
      readyConfirm: v.readyConfirm,
      mergeTitle: `${v.merge} ${v.modification}?`,
      mergeBody: (name) => `“${name}” · ${v.merge} · <strong>${v.currentVersion}</strong>.`,
      mergeConfirm: v.merge,
      discardTitle: `${v.discard} ${v.modification}?`,
      discardBody: (name) => `“${name}” · <strong>${v.permanent}</strong>.`,
      discardChip: `${v.aiAssistant} · ${v.modification} · ${v.discard}`,
      discardConfirm: v.discard,
      trunkEditTitle: `${v.editing} · ${v.awaiting}?`,
      trunkEditBody: (n) =>
        `<strong>${n}</strong> ${v.modification} · ${v.awaiting}. ${v.continue} ${v.editing} · ${v.conflict}.`,
      trunkEditChip: `${v.merge} / ${v.discard} · ${v.modification}`,
      trunkEditConfirm: `${v.continue} ${v.editing}`
    },
    time: {
      justNow: v.justNow,
      minutesAgo: (n) => ago(n, v.minute),
      hoursAgo: (n) => ago(n, v.hour),
      daysAgo: (n) => ago(n, v.day)
    },
    content: { emptyTitle: v.empty, emptyHint: `${v.choose} ${v.file} · ${v.aiAssistant}` },
    summary: {
      modified: (n) => `${n} ${v.updated}`,
      added: (n) => `${n} ${v.create}`,
      deleted: (n) => `${n} ${v.discarded}`,
      noChanges: `${v.no} ${v.modification}`
    }
  };
}
