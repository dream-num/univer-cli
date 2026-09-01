import { BooleanNumber, CellValueType, HorizontalAlign, VerticalAlign, WrapStrategy } from "@univerjs/core";
import { ChartTypeBits } from "@univerjs-pro/engine-chart";
import { ShapeFillEnum, ShapeLineTypeEnum } from "@univerjs-pro/engine-shape";
import type { Lang } from "../index.js";
import { COMPARISON_TERMS, type ComparisonTerm } from "./comparison-vocabulary.js";

/** Render labels only. Stable paths and typed before/after values stay in the SDK result. */
export function comparisonTerm(locale: Lang, term: ComparisonTerm): string {
  return COMPARISON_TERMS[locale][term];
}

// Alias serialized SDK property names to human concepts. Container identities are not labels.
const FIELD_GROUPS: Partial<Record<ComparisonTerm, string>> = {
  type: "type t kind subType rangeType pageType autoFitType hRule capType lineJoinType",
  valueType: "valueType",
  dataType: "dataType fieldDataType dataFieldType",
  displayName: "displayName displayNameRecord label placeholder description sourceName",
  metadata: "meta custom system managed resources context dataModel sourceModel structureRevision structureScopeId structured semanticRole modeId version customFields",
  identity: "id uid cfId paragraphId sectionId __record_id",
  reference: "unitId subUnitId sheetId tableId fieldId fieldIds dataFieldId parentId parentNodeId childNodeId shapeId listId primaryFieldId startDateFieldId layoutPageId masterPageId connectionSiteId rangeKey orderKey",
  property: "property properties",
  field: "field fields fieldSettings fieldsConfig fieldOrder columnFields rowFields valueFields filterFields hiddenFields",
  record: "record records dataRecordCount",
  settings: "config options settings renderConfig controls showDataAs valuePosition valueFilter",
  source: "source sourceRangeInfo from collection",
  target: "target targetCellInfo to",
  rowHeight: "h ah rowHeight defaultRowHeight trHeight",
  columnWidth: "w defaultColumnWidth",
  hidden: "hd hidden hiddenFields collapseInfo collapsed",
  rotation: "angle rotation skewX skewY",
  opacity: "opacity",
  fill: "fill fillType",
  border: "bd border borderLeft borderRight borderTop borderBottom",
  line: "stroke lineStrokeType strokeWidth lineJoinType capType cornerStyle",
  width: "width minWidth",
  height: "height minHeight",
  range: "range ranges rangeInfo sourceRangeInfo mergeData endAbsoluteRefType startAbsoluteRefType",
  theme: "theme tableStyleId palette branchColorKey",
  layout: "geometry transform sheetTransform axisAlignSheetTransform layout rect groupBaseBoundIsLocal customGeometry pathLst adjustValues adj textRectPadding",
  paragraph: "paragraph paragraphs paragraphStyle bullet listType nestingLevel zeroWidthParagraphBreak",
  section: "section sectionBreaks",
  header: "header columnHeader rowHeader showHeader repeatHeaderRow",
  footer: "footer showFooter",
  code: "code language",
  columns: "columns column col columnOffset",
  table: "table tables tableRows tableCells cells",
  shape: "shape shapeData drawings drawingsOrder shapeType",
  chart: "chart chartType seriesIndexes dimension measure subtotal",
  transition: "transition",
  duration: "duration",
  direction: "direction textDirection rightToLeft flipX flipY isHorizontal horizontalAlign verticalAlign ht vt ha va side",
  gradient: "gradientStops gradientAngle gradientType",
  connector: "connectorData routing routingMode endMarker startMarker fallbackPoint waypoints points curveData tension",
  mindmap: "mindmap",
  swimlane: "swimlane lanes containerData",
  brush: "ink tool",
  attachment: "attachments attachmentSets customBlocks",
  readOnly: "readonly",
  offset: "offset rowOffset columnOffset scrollLeft scrollTop xSplit ySplit x y position left top right bottom l r b",
  order: "order fieldOrder pageOverThenDown valueIndex",
  size: "size fontSize fs zoomRatio dataRecordCount rowSpan columnSpan",
  spacing: "gap marginTop marginBottom marginLeft marginRight",
  revision: "rev revision",
  font: "ff font fontFamily",
  link: "url link",
  group: "group children parent child groupBaseBoundIsLocal",
  list: "list tableColumnFilterList filters filter",
  wrap: "tb wrapStrategy textWrap pageWrap",
  automatic: "ia automatic autoFitType",
  textType: "body doc documentStyle shapeText textData textRuns textStyle ts st ed v val value values content customRanges customDecorations decorations data text",
  enabled: "visible selectable showDropDown showGridlines stopIfTrue showMasterSp isEmpty isCustom isRichText isTextBox freeze frozenFieldCount",
  automaticHeight: "ia",
  row: "row rows",
  start: "start startIndex st",
  end: "end ed",
  operator: "operator",
  rule: "rule",
  color: "color rgb hexCode tabColor backgroundColor",
  title: "title titles",
  displayMode: "displayMode",
  visible: "visible",
  selectable: "selectable",
  freeze: "freeze frozenFieldCount",
  stopIfTrue: "stopIfTrue",
  showGridlines: "showGridlines",
  showDropDown: "showDropDown",
  custom: "isCustom custom",
  count: "count",
  isEmpty: "isEmpty",
};

const BASE_ALIASES: Record<string, string> = {
  formula1: "formula", formula2: "formula", sheetName: "name", sheetId: "id", pattern: "style.n", n: "style.n",
  hexCode: "rgb", color: "rgb", startIndex: "start", start: "start", end: "position", count: "count",
  isEmpty: "empty", row: "row", rows: "row", from: "source", to: "target", data: "value",
  latex: "formula",
};

const FIELD_TERMS = Object.fromEntries(Object.entries(FIELD_GROUPS).flatMap(([term, fields]) =>
  fields!.split(" ").map((field) => [field, term as ComparisonTerm])
));

export function localizedComparisonPath(
  locale: Lang,
  path: readonly string[],
  lookup: (key: string) => string | undefined,
): string {
  if (path.length === 0) return comparisonTerm(locale, "item");
  const exact = lookup(path.join("."));
  if (exact !== undefined) return exact;
  return path.map((part) => {
    if (/^\d+$/u.test(part)) return `${comparisonTerm(locale, "item")} ${Number(part) + 1}`;
    const label = lookup(part);
    if (label !== undefined) return label;
    const alias = BASE_ALIASES[part];
    if (alias) {
      const aliasLabel = lookup(alias);
      if (aliasLabel !== undefined) return aliasLabel;
    }
    const term = FIELD_TERMS[part];
    // SDK map keys can be stable identities, not translatable property names.
    return comparisonTerm(locale, term ?? "unknown");
  }).join(" · ");
}

const BOOLEAN_PROPERTIES = new Set("bl it hd ia hidden readonly visible selectable collapsed showHeader showFooter showGridlines showDropDown stopIfTrue showMasterSp repeatHeaderRow flipX flipY rightToLeft isEmpty isCustom isRichText isTextBox isHorizontal managed pageOverThenDown pageWrap zeroWidthParagraphBreak groupBaseBoundIsLocal".split(" "));
const TYPE_PROPERTIES = new Set(["type", "kind", "subType", "dataType", "fieldDataType", "valueType", "shapeType", "pageType", "routingMode"]);
const STRING_ENUMS: Record<string, ComparisonTerm> = {
  string: "textType", text: "textType", number: "numberType", num: "numberType", boolean: "booleanType",
  date: "date", list: "list", listMultiple: "multipleList", checkbox: "booleanType", calendar: "calendar", grid: "grid",
  gallery: "gallery", kanban: "kanban", timeline: "timeline", attachment: "attachment", attachments: "attachment",
  rect: "rectangle", rectangle: "rectangle", ellipse: "ellipse", shape: "shape", line: "line", connector: "connector",
  manual: "manual", auto: "automatic", automatic: "automatic", inline: "inline", quote: "quote", callout: "callout",
  code: "code", brush: "brush", wipe: "wipe", slide: "slide", shapeSite: "shapeSite", filledTriangle: "filledTriangle",
  highlightCell: "highlightCell", colorScale: "colorScale", dataBar: "dataBar", iconSet: "iconSet",
  between: "between", notBetween: "notBetween", equal: "equal", notEqual: "notEqual",
  greaterThan: "greaterThan", greaterThanOrEqual: "greaterOrEqual", lessThan: "lessThan", lessThanOrEqual: "lessOrEqual",
  contains: "contains", notContains: "notContains", beginsWith: "beginsWith", endsWith: "endsWith",
  containsText: "contains", notContainsText: "notContains", left: "left", center: "center", right: "right",
  top: "top", middle: "middle", bottom: "bottom", solid: "solid", dashed: "dashed", none: "empty",
  whole: "integer", decimal: "decimal", time: "time", custom: "customFormula", textLength: "textLength", any: "allValues",
  uniqueValues: "uniqueValues", duplicateValues: "duplicateValues", rank: "rank", average: "average",
  percent: "percent", percentile: "percentile", min: "min", max: "max",
  containsBlanks: "empty", notContainsBlanks: "notEmpty", containsErrors: "error",
};

/** Only translate schema-owned enums. Never translate a cell value, paragraph text, name or formula. */
export function localizedComparisonEnum(
  locale: Lang,
  entityType: string,
  path: readonly string[],
  value: unknown,
): string | undefined {
  if (value === null || value === undefined || path.length === 0) return undefined;
  const entity = entityType.split(":")[0];
  const leaf = path.at(-1)!;
  // Base cell paths can be arbitrary user field names; even a field named "type" holds user data.
  if (entity === "record" || (entity === "cell" && !["style", "valueType"].includes(path[0]!))) return undefined;
  if (["text", "value", "formula", "formula1", "formula2", "name", "content", "title", "label", "url"].includes(leaf)) return undefined;
  const n = typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value;
  let term: ComparisonTerm | undefined;
  if (BOOLEAN_PROPERTIES.has(leaf)) {
    if (n === true || n === BooleanNumber.TRUE || n === "true") term = "enabled";
    if (n === false || n === BooleanNumber.FALSE || n === "false") term = "disabled";
  } else if (entity === "cell" && path.length === 1 && leaf === "valueType") {
    term = ({ [CellValueType.STRING]: "textType", [CellValueType.NUMBER]: "numberType", [CellValueType.BOOLEAN]: "booleanType", [CellValueType.FORCE_STRING]: "forceString" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (["ht", "ha", "horizontalAlign"].includes(leaf)) {
    term = ({ [HorizontalAlign.UNSPECIFIED]: "automatic", [HorizontalAlign.LEFT]: "left", [HorizontalAlign.CENTER]: "center", [HorizontalAlign.RIGHT]: "right", [HorizontalAlign.JUSTIFIED]: "justified", [HorizontalAlign.BOTH]: "justified", [HorizontalAlign.DISTRIBUTED]: "distributed" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (["vt", "va", "verticalAlign"].includes(leaf)) {
    term = ({ [VerticalAlign.UNSPECIFIED]: "automatic", [VerticalAlign.TOP]: "top", [VerticalAlign.MIDDLE]: "middle", [VerticalAlign.BOTTOM]: "bottom" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (["tb", "wrapStrategy"].includes(leaf)) {
    term = ({ [WrapStrategy.UNSPECIFIED]: "automatic", [WrapStrategy.WRAP]: "wrap", [WrapStrategy.OVERFLOW]: "overflow", [WrapStrategy.CLIP]: "clip" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (leaf === "fillType") {
    term = ({ [ShapeFillEnum.NoFill]: "empty", [ShapeFillEnum.SolidFill]: "solid", [ShapeFillEnum.GradientFill]: "gradient", [ShapeFillEnum.PatternFill]: "pattern", [ShapeFillEnum.PictureFill]: "image" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (leaf === "lineStrokeType") {
    term = ({ [ShapeLineTypeEnum.NoLine]: "empty", [ShapeLineTypeEnum.SolidLine]: "solid", [ShapeLineTypeEnum.GradientLine]: "gradient" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (leaf === "chartType") {
    term = ({ [ChartTypeBits.Line]: "lineChart", [ChartTypeBits.Column]: "columnChart", [ChartTypeBits.Area]: "areaChart", [ChartTypeBits.Pie]: "pieChart", [ChartTypeBits.Bar]: "barChart", [ChartTypeBits.Scatter]: "scatterChart" } as Record<number, ComparisonTerm>)[Number(n)];
  } else if (TYPE_PROPERTIES.has(leaf) || leaf === "operator" || leaf === "direction") {
    term = STRING_ENUMS[String(value)];
  } else if (entity === "table" && leaf === "displayName" && typeof value === "string") {
    const generated = /^sheets-table\.columnPrefix (\d+)$/u.exec(value);
    if (generated) return `${comparisonTerm(locale, "column")} ${generated[1]}`;
  }
  return term === undefined ? undefined : comparisonTerm(locale, term);
}
