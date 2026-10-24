# Modern Docs from Markdown

Use this path for editable, pageless Modern Docs. `compile-markdown` uses the AI SDK's
`@univer-cli/doc-markdown-facade` compiler. It inherits SDK body typography and native block styling.
Generate the completed Markdown once; visual verification is read-only. Correct the source or a
conversion defect when the generated result is wrong, rather than applying cosmetic Facade patches.

## Source and native structure

Use CommonMark/GFM for headings, paragraphs, bold, italic, strikethrough, inline code, links, quotes,
code blocks, nested lists, tasks, tables, standalone images, and dividers. Use these directives where
Markdown needs a native Univer capability:

| Syntax                                                                       | Native behavior and limits                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:::block{#summary}`                                                         | Logical addressing container. Give independently editable top-level roots explicit IDs; this wrapper does not create a BlockRange.                                                                                  |
| `> Quoted text`, fenced code, `:::callout{#notice}`                          | Native Quote, Code, and Callout BlockRanges. Quotes and callouts can contain paragraphs, headings, and lists; place tables and code outside them.                                                                   |
| `::::columns{#features gap="24"}` with `:::column{#left width="2"}` children | Native Modern `ColumnGroup`, with 2–5 direct columns. Widths are positive ratios. No nested columns or section breaks. Use longer outer fences than nested directives.                                              |
| `:::table{#readiness columnWidths="240,360"}` wrapping one GFM table         | Editable table with required positive widths matching its column count and fitting the current body or column width. Use ordinary GFM without this directive for default widths.                                    |
| `:span[text]{underline="true" color="#2563EB"}`                              | Inline rich text. Also accepts `background`, `bold`, `italic`, `superscript`, and `subscript`; boolean attributes use `"true"` / `"false"`. Colors use `#RRGGBB`; superscript and subscript are mutually exclusive. |
| `:range[text]{#decision kind="bookmark"}`                                    | Named native CustomRange. `kind="hyperlink"` also requires `url`; standard Markdown links work. Mention and Comment ranges are unsupported.                                                                         |
| `:br[]`                                                                      | Paragraph-internal break, including leading, trailing, or repeated breaks. Standard Markdown hard breaks also work.                                                                                                 |
| `::image{#cover src="assets/cover.png" width="640"}`                         | Native image in document flow. Optional height; omitted height retains aspect ratio.                                                                                                                                |
| `::chart{#growth src="assets/growth.chart.json"}`                            | Editable native chart from Chart JSON v1.                                                                                                                                                                           |
| `::shape{#milestone src="assets/milestone.shape.json"}`                      | Editable native shape from Shape JSON v1.                                                                                                                                                                           |

Do not set a callout `tone`, background, or border unless the user requests custom colors. Plain
callouts inherit the native theme. Default body font size, line spacing, and paragraph spacing also
belong to the SDK. Do not add blank paragraphs to compensate for table or quote layout defects.

Example `report.md`, with independently editable roots:

```markdown
---
univerDoc: 1
title: Product overview
---

:::block{#summary}

# Product overview

Explore [Univer](https://univer.ai) and **editable office content**.

> Keep structured content editable throughout the workflow.

:::

:::block{#readiness}

| Area      | Status   |
| --------- | -------- |
| Tables    | Native   |
| Rich text | Editable |

:::

::::columns{#features gap="24"}

:::column{#authoring width="1"}

## Authoring

Write Markdown with :span[rich text]{underline="true"}.

:::

:::column{#editing width="1"}

## Local updates

Keep :range[current content]{#current kind="bookmark"} authoritative.

:::

::::

:::callout{#notice}

Review the model and screenshot before handing off.

:::
```

`summary`, `readiness`, `features`, and `notice` are top-level update targets. To change a column,
select the containing `features` root; `authoring` and `editing` are its children. Keep explicit IDs
unique. Auto-generated source IDs are position-dependent and are unsuitable for planned local edits.

## Assets and links

Keep image and JSON files beside or beneath the source Markdown directory. `src` is relative to the
Markdown file; absolute paths, network assets, `..`, and symlinks escaping that directory are rejected.
Resolve requested remote images to local files before conversion. Standard images must occupy their
own paragraph. PNG, JPEG, GIF, WebP, and SVG are supported. Dimensions are inferred; standard images
default to a maximum width of 640. Image alt text currently produces a warning because the native
Facade cannot persist it.

Links accept HTTP, HTTPS, `mailto`, and `#fragment` destinations. Resolve relative hyperlinks before
compiling; they are not image assets. Raw HTML, unknown directives, unsupported attributes, and
structural blocks inside lists produce diagnostics.

Optional chart resource `assets/growth.chart.json`:

```json
{
  "version": 1,
  "type": "column",
  "title": "Growth",
  "data": [
    ["Quarter", "Users"],
    ["Q1", 12],
    ["Q2", 18]
  ],
  "categoryField": 0,
  "valueFields": [1],
  "width": 560,
  "height": 320
}
```

Chart types: `column`, `bar`, `line`, `area`, `pie`, `scatter`. Use a rectangular data array whose
first row supplies category and series headers. Chart rendering requires valid runtime credentials.

Optional shape resource `assets/milestone.shape.json`:

```json
{
  "version": 1,
  "type": "roundRect",
  "text": "Milestone",
  "fill": "#DCFCE7",
  "stroke": "#16A34A",
  "strokeWidth": 1,
  "width": 240,
  "height": 100
}
```

Shape types: `rect`, `roundRect`, `ellipse`, `diamond`, `triangle`, `arrow`. Keep drawings within
the available body or column width. Add the corresponding `::chart` / `::shape` directive at a
top-level flow position when using these resources.

## Generate once

Create the `.univer` file and a draft Worktree using the core Skill. Compile-only mode writes code
without changing a document; `--apply` creates a new Doc Unit with the chosen ID:

```bash
univer compile-markdown report.md --unit report --out review/doc.js --json
univer compile-markdown report.md --unit report --apply report.univer --worktree <id> \
  --source-map-out review/report.map.json --json
```

Use an unused Unit ID for creation. Save the source map from the actual successful apply, which
contains native identities; a compile-only map cannot address native updates. Inspect model readback
and a screenshot, then use the core Skill's ready/open workflow for review.

## Change selected current blocks

For a generated Doc with an execution map, export the current native blocks requested by the user.
This includes native edits, resolved image/resource bytes, refreshed identities, and the revision
from the same read; it does not mutate content:

```bash
univer export-markdown report.univer --unit report --worktree <id> --blocks summary \
  --source-map review/report.map.json --out review/summary.md --json
```

Edit `review/summary.md`, keeping the selected root ID and exported heading/link identity directives.
The default refreshed map is `review/summary.md.map.json`; `--source-map-out` can choose another path.
Reopen a ready Worktree before applying the change. Use the export's returned `revision`, not an
estimated head revision or the original creation result:

```bash
univer compile-markdown review/summary.md --unit report --apply report.univer --worktree <id> \
  --blocks summary --source-map review/summary.md.map.json --revision <exported-revision> \
  --source-map-out review/report.map.json --json
```

`--blocks` accepts comma-separated **top-level source IDs** and requires both `--source-map` and a
positive `--revision`. All three must refer to the same target and current read. Replace the saved map
only after success. A revision or mapping conflict requires a fresh native export and replanning;
do not retry with a guessed revision. Unselected content and native identities must remain untouched.

Native content is authoritative; the original Markdown is not automatically synchronized after user
edits. This workflow supports mapped generated blocks, not arbitrary native Docs. Custom fonts or
spacing, custom list indentation or independent restarts, merged/styled tables, mixed text/image
paragraphs, custom chart/shape styling, and rich text inside code may reject export. Report such
diagnostics instead of flattening content, substituting images, or regenerating the whole document.
Verify model and screenshot again before handing off the updated Worktree.
