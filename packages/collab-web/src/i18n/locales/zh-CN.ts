import type { Messages } from "./en-US";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/zh-CN";
import {
  comparisonTerm,
  localizedComparisonEntity,
  localizedComparisonEnum,
  localizedComparisonPath
} from "./comparison-labels.js";

const COMPARISON_PATH_LABELS: Readonly<Record<string, string>> = {
  text: "文字",
  value: "值",
  formula: "公式",
  formulaName: "公式名称",
  name: "名称",
  type: "类型",
  language: "语言",
  config: "设置",
  columns: "列",
  rowCount: "行数", columnCount: "列数",
  h: "行高", w: "列宽", hd: "隐藏", ia: "自动行高",
  bg: "背景", rgb: "颜色", cl: "文字颜色", fs: "字号", bl: "粗体", it: "斜体",
  range: "范围", ranges: "范围", rangeInfo: "范围", rule: "规则", operator: "比较方式",
  startRow: "起始行", endRow: "结束行", startColumn: "起始列", endColumn: "结束列",
  transform: "变换", left: "水平位置", top: "垂直位置", angle: "旋转角度",
  cfId: "规则标识", uid: "标识", id: "标识", palette: "配色", content: "内容", titles: "标题", title: "标题",
  sparklines: "迷你图", fieldsConfig: "透视字段", collection: "数据源", filters: "筛选", options: "选项",
  gap: "栏间距",
  position: "位置",
  start: "起始位置",
  count: "数量",
  geometry: "位置与尺寸",
  "geometry.x": "水平位置",
  "geometry.y": "垂直位置",
  style: "格式",
  "style.bg": "背景",
  "style.bl": "粗体",
  "style.cl": "文字颜色",
  "style.fs": "字号",
  "style.it": "斜体",
  "style.n": "数字格式",
  "style.backgroundColor.rgb": "背景色",
  "style.background": "背景色",
  backgroundColor: "背景色",
  color: "颜色",
  width: "宽度",
  height: "高度",
  tableRows: "行",
  tableCells: "单元格"
};

function comparisonPathLabel(path: readonly string[]): string {
  return localizedComparisonPath(editHistoryUI, path, (key) => COMPARISON_PATH_LABELS[key]);
}

function comparisonEntityLabel(category: string): string {
  return localizedComparisonEntity(editHistoryUI, category);
}

/**
 * Chinese shell copy. This table defines the `Messages` shape; en-US must mirror it exactly.
 * Entries that need interpolation or language-specific word order are functions.
 */
export const ZH_CN_MESSAGES: Messages = {
  app: {
    title: "协同查看器"
  },
  boot: {
    noFileTitle: "未指定要查看的文件",
    noFileBody: "在地址栏加上 <code>?file=&lt;.univer 的绝对路径&gt;</code>,例如:",
    noFileHint: "查看某个修改:再加 <code>&amp;worktree=&lt;worktreeId&gt;</code>。",
    notFoundTitle: "univerfile 不存在",
    notFoundBody: "这个 <code>.univer</code> 文件不存在,服务不会自动创建。",
    notFoundHint: (command: string): string => `先建 univerfile:<code>${command}</code>`,
    fatal: (error: string): string => `启动失败:${error}`
  },
  viewer: {
    loading: "正在加载…",
    loadFailed: (error: string): string => `加载失败:${error}`,
    previewComputeFailed: "预览计算失败",
    previewUnitUnrenderable: "此文件在合并预览中不可渲染",
    previewLoadFailed: (error: string): string => `预览加载失败:${error}`
  },
  toast: {
    worktreeGone: "该修改已不存在,已切回当前版本",
    agentReset: "AI 撤回了上一步,正在刷新…",
    workDone: (name: string): string => `「${name}」改完了,待你确认`,
    readyChanged: "这处修改在确认期间又有更新。请查看最新改动后重新提交确认。",
    mergedElsewhere: "这处修改已合入当前版本",
    discardedElsewhere: "这处修改已丢弃",
    previewRefreshed: "最新版本有更新,已刷新合并预览",
    readyFailed: (error: string): string => `提交确认失败:${error}`,
    merged: "已合入当前版本",
    mergeFailed: (error: string): string => `合入失败:${error}`,
    discardFailed: (error: string): string => `丢弃失败:${error}`,
    conflictsCannotMerge: "存在冲突,无法合入"
  },
  sidebar: {
    files: "文件",
    inProgress: "正在进行的修改",
    awaitingConfirm: "等待确认的修改",
    none: "暂无",
    noFiles: "暂无文件",
    collapse: "收起侧边栏",
    expand: "展开侧边栏",
    tailReady: "待确认",
    tailDraft: "进行中",
    worktreeRowSub: (when: string, tail: string): string =>
      `AI 助手${when ? ` · ${when}` : ""} · ${tail}`
  },
  status: {
    draft: "修改中",
    ready: "待确认",
    merged: "已合入",
    discarded: "已丢弃"
  },
  change: {
    modified: "改",
    added: "新",
    deleted: "删",
    conflict: "冲突",
    updated: "已更新"
  },
  topbar: {
    currentVersion: "当前版本",
    fallbackWorktreeName: "一处修改",
    submitForReview: "提交确认",
    mergeToCurrent: "合入当前版本",
    discard: "丢弃",
    previewUnavailable: "合并预览不可用 · 正在看原始修改",
    conflictCount: (n: number): string => `${n} 处冲突,无法自动合并`,
    divergedShowingPreview: "最新版本有改动 · 已显示合并后效果",
    divergedShowingOriginal: "最新版本有改动 · 正在看原始修改",
    segPreview: "合并预览",
    segOriginal: "原始修改",
    viewOnly: "仅查看",
    editable: "可编辑",
    editingPending: (n: number): string => `编辑中 · ${n} 处未合入`,
    lockedPending: (n: number): string => `已锁定 · ${n} 处未合入`,
    stopEditing: "停止编辑",
    editAnyway: "仍要编辑",
    segView: "查看",
    segDiff: "对比",
    comparisonSource: "左侧 · 对比来源",
    trunk: "主分支",
    refreshComparison: "刷新对比"
  },
  diff: {
    compare: "对比",
    changes: "差异",
    structuralDiff: "结构差异",
    kind: { insert: "新增", delete: "删除", update: "修改" },
    entity: comparisonEntityLabel,
    entityAt: (category: string, index: number): string =>
      `第 ${index} 个${comparisonEntityLabel(category)}`,
    changePath: comparisonPathLabel,
    changeValue: (entityType: string, path: readonly string[], value: unknown): string | undefined => localizedComparisonEnum(editHistoryUI, entityType, path, value),
    renderFailed: comparisonTerm(editHistoryUI, "loadFailed"),
    comparisonFailed: comparisonTerm(editHistoryUI, "comparisonFailed"),
    incompletePage: comparisonTerm(editHistoryUI, "incompletePage"),
    wholeItem: "整个对象",
    present: "存在",
    itemCount: (count: number): string => `${count} 项`,
    propertyCount: (count: number): string => `${count} 个属性`,
    moved: "已移动",
    rightCurrentVersion: "右侧 · 当前版本",
    revision: (revision: number): string => `修订 ${revision}`,
    readOnly: "只读",
    side: { left: "左侧", right: "右侧" },
    changeCount: (count: number): string => `${count} 处差异`,
    changedSlides: "有差异的幻灯片",
    changedBaseTables: "有差异的多维表格",
    noRawTableChanges: "原始表格数据没有差异。",
    rawTableData: "原始表格数据",
    baseAlignmentHint: "字段和记录按稳定 ID 对齐；网格、看板、日历等视图共用同一份原始表格对比。",
    checkboxState: { checked: "已勾选", unchecked: "未勾选" },
    comparingMaterializedSnapshots: "正在对比已应用最新变更的快照。",
    snapshot: "快照对比",
    noStructuralChanges: "没有结构差异",
    notPresent: "此侧不存在",
    workbookTitle: "工作簿对比",
    invalidPayloadTitle: "对比数据无效",
    invalidPayloadBody: "目标快照缺失或无法渲染。",
    summaryUnavailable: "暂无对比摘要。",
    scopeLabel: "对比范围",
    displayModeLabel: "对比显示方式",
    worksheet: "工作表",
    workbook: "工作簿",
    content: "内容",
    formatting: "格式",
    showFormulas: "显示公式",
    searchChanges: "搜索差异",
    noItems: "此范围内没有差异项。",
    selectItemHint: "选择一个差异项，查看受影响的工作表内容。",
    snapshotUnavailable: "此快照暂时无法渲染。",
    formulaDiff: "公式对比",
    baseFormula: "基准公式",
    currentFormula: "当前公式",
    baseValue: "基准值",
    currentValue: "当前值",
    base: "基准",
    current: "当前",
    summaryLabel: "对比摘要",
    sheetTree: {
      categories: {
        chart: "图表",
        cell: "单元格",
        conditionFormat: "条件格式",
        dataValidation: "数据验证",
        move: "移动",
        pivot: "数据透视表",
        rowColumn: "行与列",
        shape: "形状",
        sparkline: "迷你图",
        table: "表格",
        workbook: "工作簿",
        worksheet: "工作表"
      },
      emptyText: "（空）",
      noActiveSheet: "没有活动工作表",
      noCompareData: "没有对比数据",
      row: (index: number): string => `第 ${index} 行`,
      styles: "样式",
      workbookRoot: "工作簿",
      terms: {
        formula: "公式",
        value: "值",
        start: "起始位置",
        count: "数量",
        position: "位置",
        name: "名称",
        background: "背景",
        bold: "粗体",
        textColor: "文字颜色",
        fontSize: "字号",
        italic: "斜体",
        numberFormat: "数字格式"
      },
      titles: {
        insertedRows: "新增行",
        deletedRows: "删除行",
        insertedColumns: "新增列",
        deletedColumns: "删除列",
        rowsMoved: "移动行",
        columnsMoved: "移动列",
        rowChanged: (index: number): string => `第 ${index} 行已修改`,
        columnChanged: (index: number): string => `第 ${index} 列已修改`,
        sheetAdded: (name: string): string => `新增工作表：${name}`,
        sheetDeleted: (name: string): string => `删除工作表：${name}`,
        sheetRenamed: "工作表已重命名",
        workbookRenamed: "工作簿已重命名"
      }
    }
  },
  settings: {
    title: "设置",
    appearance: "外观",
    light: "浅色",
    dark: "深色",
    language: "语言",
    loadingLanguage: "正在加载语言…",
    languageLoadFailed: "无法加载该语言"
  },
  community: {
    joinDiscord: "加入 Discord 社区"
  },
  modal: {
    cancel: "取消",
    gotIt: "知道了",
    conflictTitle: "无法自动合入",
    conflictBody: (unitHtml: string): string =>
      `文件「<strong>${unitHtml}</strong>」在别处也被改过,当前版本已经更新,这处修改没法自动合并进去。<br><span class="muted">这处修改已原样保留为「待确认」,当前版本没有任何改动。可以让 AI 助手按最新版本调整后重试,或直接丢弃。</span>`,
    readyTitle: "提交这处修改等待确认?",
    readyBody: (name: string): string =>
      `「${name}」会进入<strong>等待确认</strong>,之后可以合入或丢弃。显式恢复编辑前,它将无法继续修改。`,
    readyConfirm: "确认提交",
    mergeTitle: "合入这处修改?",
    mergeBody: (name: string): string =>
      `「${name}」会合并到<strong>当前版本</strong>。合入后,大家在当前版本看到的就是这处修改后的数据。`,
    mergeConfirm: "确认合入",
    discardTitle: "丢弃这处修改?",
    discardBody: (name: string): string =>
      `「${name}」会被<strong>永久删除,无法恢复</strong>。当前版本不受任何影响。`,
    discardChip: "AI 助手的全部改动将清空",
    discardConfirm: "确认丢弃",
    trunkEditTitle: "在有未合入修改时直接编辑?",
    trunkEditBody: (n: number): string =>
      `当前有 <strong>${n} 处</strong>未合入的修改(AI 助手正在改或等待确认)。你现在直接编辑<strong>当前版本</strong>没问题,但如果改到它们正在改的地方,这些修改稍后<strong>合入时可能冲突</strong>、需要重做或手动解决。`,
    trunkEditChip: "更稳妥:先合入或丢弃这些修改,再编辑当前版本",
    trunkEditConfirm: "仍要编辑"
  },
  time: {
    justNow: "刚刚",
    minutesAgo: (n: number): string => `${n} 分钟前`,
    hoursAgo: (n: number): string => `${n} 小时前`,
    daysAgo: (n: number): string => `${n} 天前`
  },
  content: {
    emptyTitle: "还没有打开的文件",
    emptyHint: "从左侧选择一个文件开始查看,或等待 AI 助手的修改完成确认。"
  },
  summary: {
    modified: (n: number): string => `改 ${n}`,
    added: (n: number): string => `新增 ${n}`,
    deleted: (n: number): string => `删 ${n}`,
    noChanges: "暂无改动"
  }
};
