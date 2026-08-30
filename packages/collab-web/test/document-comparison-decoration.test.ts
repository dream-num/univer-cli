import { BooleanNumber, PresetListType, type IDocumentData, type ITextRun } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { decorateDocumentComparisonSide } from "../src/core/document-comparison-decoration";

function document(text: string): IDocumentData {
  return {
    id: "doc-1",
    documentStyle: {},
    body: {
      dataStream: `${text}\r\0`,
      paragraphs: [
        { startIndex: text.length, paragraphId: "paragraph-1" },
        { startIndex: text.length + 1, paragraphId: "paragraph-end" }
      ]
    }
  };
}

function coloredText(data: IDocumentData): Array<{ text: string; color: string; strike: boolean }> {
  const stream = data.body?.dataStream ?? "";
  return (data.body?.textRuns ?? []).flatMap((run: ITextRun) => {
    const color = run.ts?.bg?.rgb;
    return color === undefined
      ? []
      : [{ text: stream.slice(run.st, run.ed), color, strike: run.ts?.st?.s === 1 }];
  });
}

function paragraphs(values: readonly { readonly id: string; readonly text: string }[]): IDocumentData {
  let offset = 0;
  const records = values.map(({ id, text }) => {
    offset += text.length;
    const paragraph = { startIndex: offset, paragraphId: id };
    offset += 1;
    return paragraph;
  });
  return {
    id: "doc-1",
    documentStyle: {},
    body: {
      dataStream: `${values.map((value) => value.text).join("\r")}\r\0`,
      paragraphs: [...records, { startIndex: offset, paragraphId: "paragraph-end" }]
    }
  };
}

describe("document comparison decoration", () => {
  it("marks replacements blue on both sides at character precision", () => {
    const left = decorateDocumentComparisonSide(document("Ship in August"), document("Ship in September"), "left");
    const right = decorateDocumentComparisonSide(document("Ship in September"), document("Ship in August"), "right");

    expect(coloredText(left)).toContainEqual({
      text: "August",
      color: "rgba(37, 99, 235, 0.22)",
      strike: false
    });
    expect(coloredText(right)).toContainEqual({
      text: "September",
      color: "rgba(37, 99, 235, 0.22)",
      strike: false
    });
  });

  it("marks pure deletion red and pure insertion green", () => {
    const left = decorateDocumentComparisonSide(document("Ship legacy mode"), document("Ship mode"), "left");
    const right = decorateDocumentComparisonSide(document("Ship AI mode"), document("Ship mode"), "right");

    expect(coloredText(left)).toContainEqual({
      text: "legacy ",
      color: "rgba(220, 38, 38, 0.24)",
      strike: true
    });
    expect(coloredText(right)).toContainEqual({
      text: "AI ",
      color: "rgba(22, 163, 74, 0.24)",
      strike: false
    });
  });

  it("projects inserted paragraphs as a green row and an aligned red strikethrough ghost", () => {
    const leftSource = paragraphs([
      { id: "intro", text: "Intro" },
      { id: "outro", text: "Outro" }
    ]);
    const rightSource = paragraphs([
      { id: "intro", text: "Intro" },
      { id: "new-paragraph", text: "A newly added paragraph" },
      { id: "outro", text: "Outro" }
    ]);
    const left = decorateDocumentComparisonSide(leftSource, rightSource, "left");
    const right = decorateDocumentComparisonSide(rightSource, leftSource, "right");

    expect(left.body?.dataStream).toBe(right.body?.dataStream);
    expect(coloredText(left)).toContainEqual({
      text: "A newly added paragraph",
      color: "rgba(220, 38, 38, 0.24)",
      strike: true
    });
    expect(coloredText(right)).toContainEqual({
      text: "A newly added paragraph",
      color: "rgba(22, 163, 74, 0.24)",
      strike: false
    });
  });

  it("uses paragraph shading to keep inserted empty paragraphs visible on both sides", () => {
    const left = paragraphs([
      { id: "intro", text: "Intro" },
      { id: "outro", text: "Outro" }
    ]);
    const right = paragraphs([
      { id: "intro", text: "Intro" },
      { id: "empty", text: "" },
      { id: "outro", text: "Outro" }
    ]);
    const decoratedLeft = decorateDocumentComparisonSide(left, right, "left");
    const decoratedRight = decorateDocumentComparisonSide(right, left, "right");
    const leftEmpty = decoratedLeft.body?.paragraphs?.find((paragraph) => paragraph.paragraphId === "empty");
    const rightEmpty = decoratedRight.body?.paragraphs?.find((paragraph) => paragraph.paragraphId === "empty");

    expect(leftEmpty?.paragraphStyle?.shading?.backgroundColor?.rgb).toBe("rgba(220, 38, 38, 0.12)");
    expect(rightEmpty?.paragraphStyle?.shading?.backgroundColor?.rgb).toBe("rgba(22, 163, 74, 0.12)");
  });

  it("keeps a completed checklist glyph without leaking its inherited strike into the right diff", () => {
    const before = document("Publish the readiness packet.");
    before.body!.paragraphs![0]!.bullet = { listType: PresetListType.CHECK_LIST };
    const after = document("Publish the readiness packet and attach the audit export.");
    after.body!.paragraphs![0]!.bullet = { listType: PresetListType.CHECK_LIST_CHECKED };

    const decorated = decorateDocumentComparisonSide(after, before, "right");
    const publishRun = decorated.body?.textRuns?.find((run) => run.st <= 1 && run.ed > 1);

    expect(decorated.body?.paragraphs?.[0]?.bullet?.listType).toBe(PresetListType.CHECK_LIST_CHECKED);
    expect(publishRun?.ts?.st?.s).toBe(BooleanNumber.FALSE);
  });

  it("paints table-cell and column text at character precision without coloring structure tokens", () => {
    const before = nestedDocument("68%", "Customer signal", "left");
    const after = nestedDocument("81%", "Launch signal", "right");

    const left = decorateDocumentComparisonSide(before, after, "left");
    const right = decorateDocumentComparisonSide(after, before, "right");

    expect(coloredText(left)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "68", color: "rgba(37, 99, 235, 0.22)" }),
        expect.objectContaining({ text: "Customer", color: "rgba(37, 99, 235, 0.22)" }),
      ])
    );
    expect(coloredText(right)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "81", color: "rgba(37, 99, 235, 0.22)" }),
        expect.objectContaining({ text: "Launch", color: "rgba(37, 99, 235, 0.22)" }),
      ])
    );
    expect(left.body?.dataStream).toBe(before.body?.dataStream);
    expect(right.body?.dataStream).toBe(after.body?.dataStream);
  });
});

function nestedDocument(tableText: string, columnText: string, idSuffix: string): IDocumentData {
  const tablePrefix = "\x1a\x1b\x1c";
  const tableSuffix = "\n\x1d\x0e\x0f";
  const between = "Between";
  const columnPrefix = "\x12\x13";
  const columnSuffix = "\x14\x15";
  const after = "After";
  const tableParagraphEnd = tablePrefix.length + tableText.length;
  const tableEnd = tableParagraphEnd + 1 + tableSuffix.length;
  const betweenEnd = tableEnd + between.length;
  const columnStart = betweenEnd + 1;
  const columnParagraphEnd = columnStart + columnPrefix.length + columnText.length;
  const columnEnd = columnParagraphEnd + 1 + columnSuffix.length - 1;
  const afterEnd = columnEnd + 1 + after.length;
  return {
    id: "doc-nested",
    documentStyle: {},
    body: {
      dataStream: `${tablePrefix}${tableText}\r${tableSuffix}${between}\r${columnPrefix}${columnText}\r${columnSuffix}${after}\r\0`,
      paragraphs: [
        { paragraphId: `table-${idSuffix}`, startIndex: tableParagraphEnd },
        { paragraphId: "between", startIndex: betweenEnd },
        { paragraphId: `column-${idSuffix}`, startIndex: columnParagraphEnd },
        { paragraphId: "after", startIndex: afterEnd },
        { paragraphId: "sentinel", startIndex: afterEnd + 1 }
      ],
      tables: [{ tableId: "table1", startIndex: 0, endIndex: tableEnd }],
      columnGroups: [{ columnGroupId: "columns1", startIndex: columnStart, endIndex: columnEnd }]
    }
  };
}
