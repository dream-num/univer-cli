---
name: doc
description: "Read, edit, paginate, chart, inspect, and visually verify Doc units with the Lite Interface."
---

# Doc units

`execute` provides `univerAPI`, `api` (an alias of `univerAPI`), and `doc` (the `FDocument` bound by `--unit`). Do not redeclare them. A Doc unit does not provide `workbook` or `presentation`; if one is undefined, verify the selected unit type.

Use `doc.getParagraphs()` and `doc.getParagraph(paragraphId)` to select paragraphs. Query exact signatures and enum values with `univer api show <symbol>` and `univer api find <keyword>`.

## Model essentials

- A newly added Doc starts with one empty paragraph. Usually append content with `doc.appendParagraph(text)` or update the first paragraph with `setText`.
- Paragraph editing methods live directly on `doc`, not on `doc.getBody()`: `appendParagraph`, `insertParagraph`, `insertText`, and `deleteRange`.
- `doc.getParagraphs()` returns all paragraphs. `doc.getParagraph(id)` selects by stable paragraph id; indexes drift as the document changes, so use ids across multi-step edits.
- An `FDocumentParagraph` supports `getText`, `setText`, `appendText`, `setStyle`, and `getRange`.
- List and task helpers include `isListItem`, `isTask`, and `setTaskChecked`.
- Native charts are created and managed directly through `doc.newChart()`, `doc.insertChart()`,
  `doc.getCharts()`, and `doc.getChart()`.
- Colors must use `#RRGGBB`. Docs do not support formulas or recalculation.

## The dataStream model

The body is one `dataStream` string. Paragraphs are separated by `\r`, and the document ends with `\r\n`. `body.paragraphs[i].startIndex` is the index of the `\r` that terminates paragraph `i`; the paragraph text occupies the range from the previous end to that index. An empty Doc therefore has `dataStream === "\r\n"` and one empty paragraph. Offsets passed to `insertText`, `deleteRange`, and text-style operations address this stream.

## Paragraph and text styles

Pass paragraph properties and `textStyle` together to `paragraph.setStyle` when the entire current paragraph should share one style. Important paragraph fields include `horizontalAlign`, `namedStyleType`, `headingId`, `indentStart`, and `indentFirstLine`. Always query `univer api show IParagraphStyle` instead of guessing enum values.

```js
const paragraph = doc.appendParagraph("Section Title");
const changed = paragraph.setStyle({
  namedStyleType: api.Enum.NamedStyleType?.HEADING_1 ?? "HEADING_1",
  textStyle: { bl: api.Enum.BooleanNumber.TRUE },
});
if (!changed) throw new Error("paragraph style update failed");
```

`textStyle` covers the paragraph's entire current text, excluding the trailing paragraph break. Paragraph and text-style changes are applied through one document command. `ITextStyle` uses the same compact fields as Sheet text styles, including `bl` for bold, `it` for italic, `cl: { rgb }` for text color, and `bg: { rgb }` for background color.

## Native images

Native Doc images work in both Modern and Traditional Docs. In the Node authoring runtime, always
provide both `width` and `height`; omitting either still requires browser intrinsic-size loading.
Set `wrappingStyle` explicitly: use `INLINE` for ordinary content,
`WRAP_SQUARE` or `WRAP_TOP_AND_BOTTOM` when surrounding text should reflow, and reserve
`BEHIND_TEXT` / `IN_FRONT_OF_TEXT` for intentional overlays because they can cover text. Use an
explicit body range rather than the current selection, and await insertion:

```js
const anchor = doc.getParagraphs()[0];
if (!anchor) throw new Error("image anchor missing");
const range = anchor.getRange();
const image = await doc.insertImage({
  source: imageDataUri,
  imageSourceType: api.Enum.ImageSourceType.BASE64,
  width: 320,
  height: 180,
  wrappingStyle: api.Enum.DocsImageWrappingStyle.INLINE,
  textRange: {
    startOffset: range.startOffset,
    endOffset: range.startOffset,
    collapsed: true,
    segmentId: anchor.getSegmentId(),
  },
});
if (!image) throw new Error("image insert failed");
```

Prefer a valid Base64 data URI for local, reproducible authoring. Never persist a temporary signed
download URL as an image source; signed URLs are for artifact handoff only and expire. Do not install
a global `Image` or Canvas polyfill, write drawing storage directly, or replace a required image with
a table-backed filename placeholder. Verify `doc.getImages()` readback and the final screenshot;
also verify DOCX export when it is part of the request.

## Document flavor and physical pagination

Check `doc.getDocumentFlavor()` or the positive `doc.isTraditional()` guard before page-specific
work. A new empty Doc created by `createDocument` / `unit add --type doc` is Modern by default.
Modern Docs are pageless: traditional section and page-setup APIs reject them, so do not simulate
physical pages with large spacers. When the output requires Word-compatible pages, start from a
Traditional Doc such as a DOCX import or the Traditional output of `compile-typst`.

In a Traditional Doc, create a hard page boundary before a top-level paragraph with one atomic
section command:

```js
if (!doc.isTraditional()) throw new Error("Traditional Doc required for physical pagination");
const chapter = doc.findParagraphByText("Chapter 2");
if (!chapter) throw new Error("chapter heading missing");
const section = doc.insertSectionBreak(chapter.getInfo().startOffset, {
  nextSectionType: api.Enum.SectionType.NEXT_PAGE,
});
if (!section) throw new Error("section break insert failed");
```

Use `section.getEffectivePageSetup()` for resolved page geometry and screenshot the result for actual
page count and placement. `keepNext`, `keepLines`, and `widowControl` improve natural pagination but
are not hard page breaks.

## Typst, tables, pagination, and reference fidelity

For a formal document authored from Typst, use a lightweight Typst Source Bundle instead of copying generated Facade JavaScript. The bundle root contains `typst.json`, ordered `pages/*.typ`, an optional prelude, and optional `assets/`. The manifest must declare at least:

```json
{ "schemaVersion": 1, "targetUnitId": "report", "pages": ["pages/01.typ"] }
```

It may also declare `title` and `prelude`. Compile once for review, then apply the same result:

```bash
univer compile-typst paper/typst.json --out review/doc.js \
  --diagnostics-out review/diagnostics.json --preview-dir review/png --json
univer compile-typst paper/typst.json --apply report.univer --worktree <id> \
  --out review/doc.js --diagnostics-out review/diagnostics.json --json
```

`compile-typst` creates only the new Doc whose id is declared by the manifest. If that id exists, it fails before mutation; it never overwrites or merges. `--apply` and `--worktree` must appear together. Build-only mode opens no mutation session, and unrequested outputs are not generated. Errors block apply; warnings allow it but require review of both the Typst PNG and the final `.univer` screenshot. The compiler loads only the official installed `@univerjs-pro/doc-typst-native-binding`; do not install or fall back to a system `typst`.

Put shared definitions in the manifest prelude rather than using `#import` or `#include`. Store PNG,
JPEG, GIF, WebP, or SVG images under the bundle-root `assets/` directory and reference them as
`#image("assets/name.png", width: 240pt, height: 120pt)`. The compiler embeds the asset and inserts a
native Doc image with deterministic dimensions; it does not emit a table placeholder. Review any
warning about mismatched `cover` / `contain` geometry or unavailable alternative-text authoring
against the direct Typst PNG. A fixed left/right layout must pass every cell as an argument of one
grid:

```typst
#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [Left region],
  [Right region],
)
```

Use diagnostics source paths and spans to correct syntax. An evaluator error is not evidence that the whole grid, table, image, or spacing capability is unsupported. Make one minimal page pass first, then expand the manifest page by page.

For reference reconstruction, keep three evidence layers: the reference, Typst-rendered PNG when Typst source exists, and the final `.univer` screenshot. Resolve reference-to-Typst source differences before diagnosing Typst-to-Univer Facade differences. Prioritize editable text, tables, physical pagination, headers and footers, and fonts. Typst lowering does not create native chart objects; add requested data-driven charts afterward through the `FDocument` chart methods ("Native charts"). Brand marks and illustrations are not the default priority.

Layout-sensitive pages should explicitly declare font family or named face, font size, `leading`, paragraph spacing, heading size and spacing, and `hyphenate`. Build measures Typst's resolved line advance and maps it to exact Doc paragraph spacing; do not add document-specific leading compensation. Preserve fractional sizes such as `9.2pt` and `10.4pt`. Use only normal and bold for generic Word-compatible weights. Select a resolvable named face for Semibold or Black instead of assuming a continuous `100..900` Doc weight API. Literal underscores such as `read_file` require raw text or correct escaping and must be confirmed in the Typst PNG.

For a fixed two-column region or one-row grid in a paginated Doc, prefer a **borderless layout table** instead of switching to a pageless Column Group. Real data tables should define column widths, header rows, merges, and border semantics explicitly. Do not divide uneven content into equal columns by default.

Typst source must express border topology and fill regions explicitly. Use a static table `fill` for uniform backgrounds and `table.cell(fill: ...)[...]` for local row, column, or cell highlights. For booktabs or local rules, use `stroke: none` plus explicit `table.hline(...)` or `table.vline(...)`; use the default full grid only when the reference actually has one. Use `table.header(...)` and static colspan or rowspan for grouped headers, and `table.cell(stroke: ...)[...]` for cell-local borders. Do not rely on Typst defaults or opaque dynamic fill/stroke functions when static semantics can be mapped deterministically.

```bash
univer execute report.univer --worktree <id> --unit <u> -e '
const table = doc.insertTableFromData(
  [["Group", ""], ["Name", "Description"], ["A", "Long description"]],
  { width: 602, columnWidths: [200.667, 401.333], headerRowCount: 2 }
);
if (!table) throw new Error("table insert failed");
table.setColumnWidth(0, 200.667);
table.setColumnWidth(1, 401.333);
table.mergeCells({ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 });
table.setHeaderRowCount(2);
table.setTableBorder({ preset: api.Enum.DocsTableBorderPreset.None, color: "#FFFFFF", width: 0 });
table.setBorder(
  { startRow: 1, endRow: 1, startColumn: 0, endColumn: 1 },
  { preset: api.Enum.DocsTableBorderPreset.Bottom, color: "#000000", width: 1 }
);
'
```

For cell-local paragraph styles, constrain the target with `table.getCellContentRange(row, column)` and confirm the target text. Do not search duplicate text globally and broadcast a mutation. Merge base font family, size, line spacing, and paragraph spacing with bold, italic, underline, and color overlays; a later `setStyle` can otherwise replace the base font. Do not use DocModel internals, `tableSource`, body markers, or invisible control characters to force layout.

The public Facade has no verified dynamic current-page field or table-cell padding and
vertical-alignment mutation. Record these as gaps; do not fake them with horizontal rules, page-sized
spacers, or repeated fixed page numbers. Literal headers and footers are supported.

## Native charts

Doc chart support is registered in the runtime. Create detached chart information directly from
`doc`, then insert it to obtain a live `FDocumentChart`. Query exact signatures before authoring:

```bash
univer api show FDocument.newChart FDocument.insertChart FDocument.getCharts FDocument.getChart FDocumentChart FChart FChartBuilderBase FDocumentChartBuilderOf IDocumentChartMethods DocsChartInsertAnchorKind
```

Build the chart detached, configure its data, mapping, anchor, and size, then await insertion:

```js
const info = doc
  .newChart(univerAPI.Enum.ChartTypeString.Column)
  .setTitle({ text: "Quarterly Revenue" })
  .setSource([
    ["Quarter", "Revenue"],
    ["Q1", 12],
    ["Q2", 18],
    ["Q3", 15],
  ])
  .setCategoryField(0)
  .setValueFields([1])
  .setPosition({ kind: univerAPI.Enum.DocsChartInsertAnchorKind.BodyOffset, offset: 0 })
  .setInline()
  .setSize(480, 320)
  .build();
const inserted = await doc.insertChart(info);
return { chartId: inserted.getId(), drawingId: inserted.getDrawingId(), info: inserted.getInfo() };
```

`doc.getCharts()` and `doc.getChart(id)` return live charts. Common setters update the live chart;
await `chart.setDataSource(values)` for data changes. For one complete replacement, use
`chart.toBuilder()`, call `.build()`, then `await chart.update(info)`. Remove it with
`await chart.remove()` and check the returned boolean. Await `insertChart`, `setDataSource`,
`update`, and `remove` before `execute` returns.

Anchor kinds include selection, body offset, paragraph, and text range. Verify each operation in a
fresh read-only `execute` with
`doc.getCharts().map((item) => ({ id: item.getId(), drawingId: item.getDrawingId(), type: item.getType(), info: item.getInfo() }))`.
For an update, confirm the chart ID, count, type, title, anchor, layout, and data. For a removal,
confirm the chart is absent. Then screenshot the affected page and test DOCX export when export
fidelity is part of the task.

## Inspect and verify

- `univer inspect document <file> --unit <id>` reports title, mode,
  paragraph and character counts, structural features, and paragraph previews.
- `univer inspect paragraph <index|id> [...] <file> --unit <id>` reports full text, paragraph style,
  list membership, and text-run summaries. Indexes are zero-based.
- For fine-grained reads, use read-only execute: `return doc.getParagraphs().map((p) => p.getText());`.

Logical inspection cannot reveal actual wrapping or pagination. For layout-sensitive work, render
PNGs with `screenshot` before following the core Skill's "Finish the task" steps. Imported DOCX
paragraphs may lack persistent paragraph ids, in which case inspect falls back to a zero-based index;
paragraphs created or edited in the same session have stable ids.
