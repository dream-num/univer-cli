import type { IDocumentBody, IDocumentData, IParagraph, ITextStyle } from "@univerjs/core";
import {
  BooleanNumber,
  PresetListType,
  TextDecoration,
  TextX,
  TextXActionType,
  Tools
} from "@univerjs/core";
import {
  buildDocumentComparisonModel,
  type DocumentComparisonParagraph,
  type DocumentComparisonRow
} from "@univer/unit-compare";
import diff from "fast-diff";

export type ComparisonSide = "left" | "right";
export type ComparisonTone = "delete" | "insert" | "update";

interface ParagraphSpan {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly paragraph: IParagraph;
}

interface ToneRange {
  readonly start: number;
  readonly end: number;
  readonly tone: ComparisonTone;
}

const TONE_STYLE: Record<ComparisonTone, ITextStyle> = {
  delete: {
    bg: { rgb: "rgba(220, 38, 38, 0.24)" },
    st: {
      s: BooleanNumber.TRUE,
      c: BooleanNumber.FALSE,
      cl: { rgb: "#dc2626" },
      t: TextDecoration.SINGLE
    }
  },
  insert: { bg: { rgb: "rgba(22, 163, 74, 0.24)" } },
  update: { bg: { rgb: "rgba(37, 99, 235, 0.22)" } }
};

const PARAGRAPH_TONE_COLOR: Record<ComparisonTone, string> = {
  delete: "rgba(220, 38, 38, 0.12)",
  insert: "rgba(22, 163, 74, 0.12)",
  update: "rgba(37, 99, 235, 0.10)"
};

/** Clone one Doc comparison side and paint character-level changes into native text runs. */
export function decorateDocumentComparisonSide(
  current: IDocumentData,
  peer: IDocumentData,
  side: ComparisonSide
): IDocumentData {
  const decorated = Tools.deepClone(current);
  copyMissingRootObjects(decorated, peer);
  decorateBody(decorated.body, peer.body, side);
  for (const [segmentId, header] of Object.entries(decorated.headers ?? {})) {
    decorateBody(header.body, peer.headers?.[segmentId]?.body, side);
  }
  for (const [segmentId, footer] of Object.entries(decorated.footers ?? {})) {
    decorateBody(footer.body, peer.footers?.[segmentId]?.body, side);
  }
  decorateTables(decorated, current, peer);
  return decorated;
}

function decorateBody(
  current: IDocumentBody | undefined,
  peer: IDocumentBody | undefined,
  side: ComparisonSide
): void {
  if (current === undefined) return;
  const left = side === "left" ? current : peer;
  const right = side === "right" ? current : peer;
  const model = buildDocumentComparisonModel({
    left: { body: left },
    right: { body: right }
  });
  const ghostParagraphIds = insertMissingParagraphs(current, peer, side, model.rows);
  const leftParagraphs = paragraphSpans(left);
  const rightParagraphs = paragraphSpans(right);
  const leftById = new Map(leftParagraphs.map((span) => [span.id, span]));
  const rightById = new Map(rightParagraphs.map((span) => [span.id, span]));
  const ranges: ToneRange[] = [];
  current.textRuns ??= [];
  clearCheckedListCompletionStrike(current);

  const decoratedById = new Map(paragraphSpans(current).map((span) => [span.id, span]));

  for (const row of model.rows) {
    const before = row.left === null ? undefined : leftById.get(row.left.paragraphId);
    const after = row.right === null ? undefined : rightById.get(row.right.paragraphId);
    const own = side === "left" ? row.left : row.right;
    const ownId = own?.paragraphId ?? ghostParagraphIds.get(row.id);
    const rendered = ownId === undefined ? undefined : decoratedById.get(ownId);
    if (row.left === null || row.right === null) {
      if (rendered !== undefined) {
        const tone: ComparisonTone = own === null ? "delete" : "insert";
        ranges.push({ start: rendered.start, end: rendered.end, tone });
        applyParagraphTone(rendered.paragraph, tone);
      }
      continue;
    }
    if (before === undefined || after === undefined || left === undefined || right === undefined) {
      continue;
    }
    const beforeText = left.dataStream.slice(before.start, before.end);
    const afterText = right.dataStream.slice(after.start, after.end);
    if (rendered === undefined) continue;
    const textRanges = buildTextRanges(
      beforeText,
      afterText,
      side === "left" ? rendered.start : before.start,
      side === "right" ? rendered.start : after.start
    );
    ranges.push(...(side === "left" ? textRanges.left : textRanges.right));
    if (
      beforeText === afterText &&
      stableJson(withoutPosition(before.paragraph)) !== stableJson(withoutPosition(after.paragraph))
    ) {
      if (rendered !== undefined) {
        ranges.push({ start: rendered.start, end: rendered.end, tone: "update" });
        applyParagraphTone(rendered.paragraph, "update");
      }
    }
  }

  for (const range of mergeAdjacentRanges(ranges)) applyTone(current, range);
  decorateStructuredRanges(current, left, right, side);
}

/** Keep the checked glyph, but reserve strikethrough for actual deletions in Compare. */
function clearCheckedListCompletionStrike(body: IDocumentBody): void {
  for (const paragraph of paragraphSpans(body)) {
    if (paragraph.paragraph.bullet?.listType !== PresetListType.CHECK_LIST_CHECKED) continue;
    const length = paragraph.end - paragraph.start;
    if (length <= 0) continue;
    TextX.apply(body, [
      { t: TextXActionType.RETAIN, len: paragraph.start },
      {
        t: TextXActionType.RETAIN,
        len: length,
        body: {
          dataStream: "",
          textRuns: [
            {
              st: 0,
              ed: length,
              ts: { st: { s: BooleanNumber.FALSE } }
            }
          ]
        }
      }
    ]);
  }
}

function insertMissingParagraphs(
  current: IDocumentBody,
  peer: IDocumentBody | undefined,
  side: ComparisonSide,
  rows: readonly DocumentComparisonRow[]
): Map<string, string> {
  const ghostParagraphIds = new Map<string, string>();
  if (peer === undefined) return ghostParagraphIds;
  const originalSpans = paragraphSpans(current);
  const originalIds = new Set(originalSpans.map((span) => span.id));
  const sentinelOffset = findSentinelOffset(current);

  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (row === undefined) continue;
    const own = side === "left" ? row.left : row.right;
    const source = side === "left" ? row.right : row.left;
    if (own !== null || source === null) continue;
    // A plain paragraph insertion cannot safely synthesize missing table rows/cells or columns.
    // Keep the present side colored and let the native structured object remain valid.
    if (source.structureId !== undefined) continue;
    const nextOwn = rows.slice(rowIndex + 1).find((candidate) =>
      side === "left" ? candidate.left !== null : candidate.right !== null
    );
    const nextParagraph = side === "left" ? nextOwn?.left : nextOwn?.right;
    const insertionOffset = nextParagraph?.start ?? sentinelOffset;
    const ghostId = originalIds.has(source.paragraphId)
      ? `comparison-ghost-${side}-${source.paragraphId}-${rowIndex}`
      : source.paragraphId;
    const insertionBody = paragraphInsertionBody(peer, source, ghostId);
    TextX.apply(current, [
      { t: TextXActionType.RETAIN, len: insertionOffset },
      { t: TextXActionType.INSERT, len: insertionBody.dataStream.length, body: insertionBody }
    ]);
    const insertedParagraph = current.paragraphs?.find(
      (paragraph) => paragraph.startIndex === insertionOffset + insertionBody.dataStream.length - 1
    );
    if (insertedParagraph !== undefined) insertedParagraph.paragraphId = ghostId;
    ghostParagraphIds.set(row.id, ghostId);
  }
  return ghostParagraphIds;
}

function paragraphInsertionBody(
  source: IDocumentBody,
  paragraph: DocumentComparisonParagraph,
  paragraphId: string
): IDocumentBody {
  const start = paragraph.start;
  const end = paragraph.end + 1;
  const ownParagraph = source.paragraphs?.[paragraph.index];
  const textRuns = (source.textRuns ?? []).flatMap((run) => {
    const rangeStart = Math.max(run.st, start);
    const rangeEnd = Math.min(run.ed, end);
    return rangeEnd <= rangeStart
      ? []
      : [{ ...Tools.deepClone(run), st: rangeStart - start, ed: rangeEnd - start }];
  });
  return {
    dataStream: source.dataStream.slice(start, end),
    textRuns,
    paragraphs: ownParagraph === undefined
      ? []
      : [{ ...Tools.deepClone(ownParagraph), paragraphId, startIndex: end - start - 1 }]
  };
}

function findSentinelOffset(body: IDocumentBody): number {
  const sentinel = (body.paragraphs ?? []).find((paragraph) => body.dataStream[paragraph.startIndex] === "\0");
  return sentinel?.startIndex ?? body.dataStream.length;
}

function paragraphSpans(body: IDocumentBody | undefined): ParagraphSpan[] {
  if (body === undefined) return [];
  const paragraphs = [...(body.paragraphs ?? [])]
    .filter((paragraph) => typeof paragraph.paragraphId === "string")
    .sort((left, right) => left.startIndex - right.startIndex);
  return paragraphs.map((paragraph, index) => ({
    id: paragraph.paragraphId!,
    start: index === 0 ? 0 : (paragraphs[index - 1]?.startIndex ?? -1) + 1,
    end: paragraph.startIndex,
    paragraph
  }));
}

function buildTextRanges(
  leftText: string,
  rightText: string,
  leftStart: number,
  rightStart: number
): { left: ToneRange[]; right: ToneRange[] } {
  const left: ToneRange[] = [];
  const right: ToneRange[] = [];
  let leftOffset = 0;
  let rightOffset = 0;
  const chunks = diff(leftText, rightText);
  for (let index = 0; index < chunks.length; ) {
    const chunk = chunks[index];
    if (chunk === undefined) break;
    if (chunk[0] === diff.EQUAL) {
      leftOffset += chunk[1].length;
      rightOffset += chunk[1].length;
      index += 1;
      continue;
    }
    let leftLength = 0;
    let rightLength = 0;
    let hasDeletion = false;
    let hasInsertion = false;
    while (index < chunks.length) {
      const changed = chunks[index];
      if (changed === undefined) break;
      if (changed[0] === diff.EQUAL) {
        const followedByChange = chunks[index + 1]?.[0] !== undefined && chunks[index + 1]?.[0] !== diff.EQUAL;
        // A one- or two-character equality inside an edit is usually an accidental LCS
        // anchor (for example 68 -> 81 sharing only "8"). Treat the whole cluster as
        // one bilateral replacement so both sides stay blue.
        if (changed[1].length > 2 || !followedByChange) break;
        leftLength += changed[1].length;
        rightLength += changed[1].length;
        index += 1;
        continue;
      }
      if (changed[0] === diff.DELETE) {
        leftLength += changed[1].length;
        hasDeletion = true;
      }
      if (changed[0] === diff.INSERT) {
        rightLength += changed[1].length;
        hasInsertion = true;
      }
      index += 1;
    }
    if (leftLength > 0) {
      left.push({
        start: leftStart + leftOffset,
        end: leftStart + leftOffset + leftLength,
        tone: hasInsertion ? "update" : "delete"
      });
      leftOffset += leftLength;
    }
    if (rightLength > 0) {
      right.push({
        start: rightStart + rightOffset,
        end: rightStart + rightOffset + rightLength,
        tone: hasDeletion ? "update" : "insert"
      });
      rightOffset += rightLength;
    }
  }
  return { left, right };
}

function applyTone(body: IDocumentBody, range: ToneRange): void {
  const length = range.end - range.start;
  if (length <= 0) return;
  TextX.apply(body, [
    { t: TextXActionType.RETAIN, len: range.start },
    {
      t: TextXActionType.RETAIN,
      len: length,
      body: {
        dataStream: "",
        textRuns: [{ st: 0, ed: length, ts: TONE_STYLE[range.tone] }]
      }
    }
  ]);
}

function applyParagraphTone(paragraph: IParagraph, tone: ComparisonTone): void {
  paragraph.paragraphStyle = {
    ...paragraph.paragraphStyle,
    shading: { backgroundColor: { rgb: PARAGRAPH_TONE_COLOR[tone] } }
  };
}

function decorateStructuredRanges(
  current: IDocumentBody,
  left: IDocumentBody | undefined,
  right: IDocumentBody | undefined,
  side: ComparisonSide
): void {
  decorateRangeCollection(current, left?.blockRanges, right?.blockRanges, "blockId", side, true);
  decorateRangeCollection(current, left?.customRanges, right?.customRanges, "rangeId", side, false);
  decorateRangeCollection(current, left?.columnGroups, right?.columnGroups, "columnGroupId", side, true);
}

function decorateRangeCollection(
  current: IDocumentBody,
  leftValue: unknown,
  rightValue: unknown,
  idKey: "blockId" | "rangeId" | "columnGroupId",
  side: ComparisonSide,
  shadeParagraphs: boolean
): void {
  const left = indexedRanges(leftValue, idKey);
  const right = indexedRanges(rightValue, idKey);
  const rendered = indexedRanges(
    idKey === "blockId"
      ? current.blockRanges
      : idKey === "rangeId"
        ? current.customRanges
        : current.columnGroups,
    idKey
  );
  for (const stableId of new Set([...left.keys(), ...right.keys()])) {
    const before = left.get(stableId);
    const after = right.get(stableId);
    if (before !== undefined && after !== undefined && stableJson(withoutRangePosition(before)) === stableJson(withoutRangePosition(after))) {
      continue;
    }
    const own = side === "left" ? before : after;
    const peer = side === "left" ? after : before;
    const range = rendered.get(stableId);
    if (range === undefined) continue;
    const tone: ComparisonTone = own === undefined ? "delete" : peer === undefined ? "insert" : "update";
    applyTone(current, { start: range.startIndex, end: range.endIndex + 1, tone });
    if (shadeParagraphs) {
      for (const paragraph of paragraphSpans(current)) {
        if (paragraph.start < range.endIndex + 1 && paragraph.end + 1 > range.startIndex) {
          applyParagraphTone(paragraph.paragraph, tone);
        }
      }
    }
  }
}

function indexedRanges(
  value: unknown,
  idKey: "blockId" | "rangeId" | "columnGroupId"
): Map<string, { readonly startIndex: number; readonly endIndex: number; readonly [key: string]: unknown }> {
  const values = Array.isArray(value) ? value : [];
  return new Map(values.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const range = entry as Record<string, unknown>;
    const id = range[idKey];
    return typeof id === "string" && typeof range.startIndex === "number" && typeof range.endIndex === "number"
      ? [[id, range as { readonly startIndex: number; readonly endIndex: number; readonly [key: string]: unknown }] as const]
      : [];
  }));
}

function withoutRangePosition(value: Record<string, unknown>): unknown {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "startIndex" && key !== "endIndex"));
}

function copyMissingRootObjects(decorated: IDocumentData, peer: IDocumentData): void {
  const target = decorated as IDocumentData & Record<string, unknown>;
  const source = peer as IDocumentData & Record<string, unknown>;
  for (const key of ["tableSource", "drawings"] as const) {
    const targetRecord = asRecord(target[key]) ?? {};
    const sourceRecord = asRecord(source[key]) ?? {};
    Reflect.set(target, key, {
      ...Tools.deepClone(sourceRecord),
      ...targetRecord
    });
  }
}

function decorateTables(
  decorated: IDocumentData,
  current: IDocumentData,
  peer: IDocumentData
): void {
  const currentTables = asRecord((current as IDocumentData & Record<string, unknown>).tableSource) ?? {};
  const peerTables = asRecord((peer as IDocumentData & Record<string, unknown>).tableSource) ?? {};
  const renderedTables = asRecord((decorated as IDocumentData & Record<string, unknown>).tableSource) ?? {};
  for (const tableId of new Set([...Object.keys(currentTables), ...Object.keys(peerTables)])) {
    const own = currentTables[tableId];
    const other = peerTables[tableId];
    if (own !== undefined && other !== undefined && stableJson(own) === stableJson(other)) continue;
    const table = asRecord(renderedTables[tableId]);
    const rows = Array.isArray(table?.tableRows) ? table.tableRows : [];
    const otherRows = Array.isArray(asRecord(other)?.tableRows) ? asRecord(other)?.tableRows as unknown[] : [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const rowValue = rows[rowIndex];
      const row = asRecord(rowValue);
      const cells = Array.isArray(row?.tableCells) ? row.tableCells : [];
      const peerRow = asRecord(otherRows[rowIndex]);
      const peerCells = Array.isArray(peerRow?.tableCells) ? peerRow.tableCells : [];
      for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
        const cellValue = cells[columnIndex];
        const cell = asRecord(cellValue);
        const peerCell = peerCells[columnIndex];
        if (cell === undefined || stableJson(cellValue) === stableJson(peerCell)) continue;
        const tone: ComparisonTone = own === undefined ? "delete" : peerCell === undefined ? "insert" : "update";
        cell.backgroundColor = { rgb: PARAGRAPH_TONE_COLOR[tone] };
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function mergeAdjacentRanges(ranges: readonly ToneRange[]): ToneRange[] {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: ToneRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && previous.tone === range.tone && previous.end >= range.start) {
      merged[merged.length - 1] = { ...previous, end: Math.max(previous.end, range.end) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function withoutPosition(paragraph: IParagraph): unknown {
  return Object.fromEntries(
    Object.entries(paragraph).filter(([key]) => key !== "startIndex" && key !== "paragraphId")
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value) ?? "undefined";
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
