# Univer CLI

> Give agents a local command-line workspace for creating, editing, inspecting, and delivering spreadsheets, documents, presentations, multidimensional tables, and canvases.

English · [简体中文](README.zh-CN.md)

[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-univer--cli-0a7ea4)](https://github.com/dream-num/skills/tree/main/skills/univer-cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.0-339933?logo=node.js&logoColor=white)](apps/cli/package.json)
[![CI](https://github.com/dream-num/univer-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/dream-num/univer-cli/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Univer CLI is a local-first Office CLI for agents. Install the official `univer-cli` Skill, describe the result you want, and let the agent create or edit Sheet, Doc, Slide, Base, and Board content. It can also work with existing Excel, Word, and PowerPoint files.

Changes stay in an isolated Worktree while the agent inspects the content, edits it through the Univer Facade, and verifies the stored model and rendered result. When the task is ready, the agent returns a local Viewer URL so you can review the result and decide whether to merge, revise, or discard it.

## Quick start

Copy the entire prompt below into the agent you use:

```text
Install the Univer CLI Skill:
npx skills add dream-num/skills -s univer-cli -g

Download the official sample to ./hello.univer:
https://univer.ai/cli-assets/hello.univer

Open ./hello.univer with Univer CLI, then show me the local Viewer link and
what I can explore.

If you need help, visit:
https://discord.gg/nThHPupraR
```

## What can it do?

- **Analyze and build spreadsheets** — read or create data, clean fields, write formulas, apply formatting and validation, and add tables, charts, pivots, filters, sparklines, conditional formatting, and images.
- **Write and lay out documents** — create paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, pagination, and page layouts.
- **Create and revise presentations** — build a deck from an outline, edit selected pages, add text, shapes, images, tables, charts, and transitions, and detect off-page, overflowing, or overlapping text.
- **Build multidimensional tables** — create Base tables, fields, records, views, formulas, filters, sorting, grouping, and Sheet-backed references.
- **Draw editable canvases** — create Board shapes, text, connectors, images, native charts, and diagrams, with connector and layout analysis.
- **Compose several content types** — keep Sheet, Doc, Slide, Base, and Board Units in one `.univer` file and reference content across Units.
- **Work with Office files** — import Excel, CSV, TSV, Word, and PowerPoint files, then export supported content to standard Office formats.
- **Review agent changes safely** — keep every write in an isolated draft until the user explicitly decides to merge or discard it.

### Example requests

```text
Use univer-cli to create a payroll spreadsheet with formulas, totals, validation,
conditional formatting, and a summary chart. Return a Viewer URL for review.

Use univer-cli to turn brief.md into a six-slide lesson deck about bubble sort.
Check every page for overflow and overlap before marking the Worktree ready.

Use univer-cli to create a formal weekly project report with an executive summary,
a risk table, next week's plan, headers, and footers, then export it as DOCX.

Use univer-cli to create a customer-tracking Base with company, contact, stage,
expected value, and next action fields, plus a view grouped by stage.

Use univer-cli to create a sales Sheet and a summary Slide in the same .univer file,
with the Slide chart reading data from the Sheet.
```

## Capabilities

| Content | Create and edit                                                                               | Verify and review                                                   | Import                               | Export                |
| ------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| Sheet   | Cells, formulas, styles, tables, charts, pivots, filters, validation, images, and more        | Structured workbook/range inspection, screenshots, and PDF printing | `.xls` `.xlsx` `.xlsm` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Doc     | Paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, and pagination | Document/paragraph readback, page screenshots, and PDF printing     | `.doc` `.docx`                       | `.docx`               |
| Slide   | Pages, text, shapes, images, tables, charts, SVG layouts, and transitions                     | Structure inspection, layout lint, screenshots, and PDF printing    | `.ppt` `.pptx`                       | `.pptx`               |
| Base    | Tables, fields, records, views, formulas, filters, sorting, and grouping                      | Structured data checks and workbench screenshots                    | `.xls` `.xlsx` `.xlsm` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Board   | Shapes, text, connectors, images, native charts, and routing                                  | Element/connector analysis, screenshots, and PDF printing           | —                                    | —                     |

Every content type supports isolated draft editing, review, revision, merge, and discard. Board file import and export are not currently supported.

## How it works

1. The discovery Skill checks that Univer CLI is installed, current, and ready.
2. The agent loads the core Skill and the matching Sheet, Doc, Slide, Base, or Board Skill from the installed CLI.
3. The agent imports or creates a `.univer` file and opens an isolated draft Worktree.
4. It inspects the target Unit, makes the requested changes, and reads the stored model back.
5. It captures screenshots or runs layout lint when appearance matters.
6. It marks the Worktree `ready` and returns a local Viewer URL.
7. The user reviews the result and explicitly chooses merge, reopen, or discard.

Inside a Worktree, the Viewer offers read-only **View** and **Compare** modes for Sheet, Doc, Slide,
Base, and Board Units. Diff compares the current Worktree with a pinned Trunk state by default; the
left side can instead be another active Worktree. Both sides are materialized through their pinned
heads before comparison, and a stale comparison is refreshed explicitly.

Sheet Compare offers independent **Content / Formatting** filters and a **Show formulas** switch
for both grids. Content uses plain display copies without original cell, rich-text, table-theme or
conditional formatting, retaining diff colors and row/column geometry; Formatting keeps the original
styles. Formula display resolves shared formulas without changing stored values or results;
worksheet/workbook scope is selected in the change-tree header.

Univer Pro History owns semantic diff computation. The application only maps its returned changes,
inline segments, and native alignment to localized navigation, read-only coloring, and linked viewports.

The pinned result is also available through the Server API as a versioned, UI-independent Agent
context. CLI clients and agents can page or filter normalized insert/delete/update items by entity
type, stable parent ID, or search text;
each item carries stable paths and side-specific navigation targets for Sheet, Doc, Slide, Base, and
Board. Normalized leaf changes expose semantic property paths, typed before/after values, and bounded
inline text/formula hunks. Normalized paths retain an exact `sourcePath` when needed. Doc alignment
has independent context pagination; Sheet row/column alignment uses compact native index runs.
Callers can select `summary`, `changes`, or `full` detail without changing
item identity. See the [Agent diff contract and executable example](packages/collab-gateway-contract/README.md#agent-diff-contract).

The operational Skills ship with Univer CLI so their commands and Facade guidance match the installed application version.

## CLI capabilities

The Skill selects these capabilities automatically. Most users do not need to call them manually.

| Commands                                           | Purpose                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `new`, `import`                                    | Create a `.univer` file or import Office content                                  |
| `status`, `unit`                                   | Inspect file status and manage Sheet, Doc, Slide, Base, or Board Units            |
| `worktree`                                         | Create, prepare, reopen, merge, or discard isolated changes                       |
| `inspect`                                          | Read Workbook, Worksheet, Range, Document, Paragraph, Presentation, or Slide data |
| `execute`                                          | Read or edit content through trusted Univer Facade code                           |
| `screenshot`, `print`, `lint`                      | Render content, print PDF, and diagnose Slide layout issues                       |
| `compile-svg`, `compile-typst`                     | Turn SVG or Typst sources into editable Univer content                            |
| `export`, `open`                                   | Export Office files or return a local Viewer URL                                  |
| `api`, `resources`, `skills`                       | Find Facade APIs, visual resources, and operational guidance                      |
| `config`, `doctor`, `update`, `daemon`, `optimize` | Configure, diagnose, update, run, and maintain the local application              |

See the [complete CLI reference](apps/cli/README.md) for command options, selectors, environment variables, machine output, and process behavior.

## Requirements and current limits

- An agent that supports Agent Skills, plus Node.js 24.0 or later and npm/npx.
- Screenshot, PDF printing, Slide layout lint, and browser text measurement require Chrome, Chromium, or Edge. The agent can prepare the browser through `univer screenshot setup`.
- `execute` runs trusted JavaScript and is not a sandbox for untrusted code.
- `.univer` files, the Gateway, Viewer, daemon, runtime workers, and browser cache stay on the local machine. Explicit HTTP imports, resource downloads, and update checks can access the network.
- Board supports structural and visual verification but does not currently support file import or export.

## Architecture

Univer CLI is built on the [Univer SDK](https://docs.univer.ai/). This repository assembles the SDK into a local Office CLI for agents and implements the application-specific capabilities for `.univer` files, the Gateway, Viewer, process management, and safe data upgrades.

`apps/cli` is the only public application, and `univer` is its only program and binary. Private `packages/*` projects support the application and are not parallel products.

## Data and security

A `.univer` file uses SQLite to store Units, revisions, Worktrees, local resources, and a rebuildable History index. Supported earlier formats are upgraded only after read-only identification, a byte-for-byte backup, independent candidate verification, and atomic replacement. A failed upgrade never overwrites the source.

The bundled Univer runtime development license is a localhost application credential authorized for redistribution with this application. It rotates every 90 days and is separate from the repository software license.

## Development

The project requires Node.js 24.0 or later and the pnpm version declared in `package.json`.

```bash
git clone https://github.com/dream-num/univer-cli.git
cd univer-cli
pnpm install --frozen-lockfile
pnpm link:cli
pnpm check
```

Stop the daemon before unlinking a local build:

```bash
univer daemon stop
pnpm unlink:cli
```

### SDK upgrades

The Univer SDK, Univer CLI SDK, and Collaboration Server SDK use one exact version baseline. Upgrade
the complete SDK dependency graph with:

```bash
pnpm update:sdk --sdk_version <exact-sdk-version>
```

The updater preserves only independently versioned packages such as native bindings and icons.
Commit every affected manifest together with `pnpm-lock.yaml`; partial manual SDK updates are not
allowed.

## License

[Apache-2.0](LICENSE). Univer Pro SDK packages, runtime credentials, native bindings, and other third-party components retain their own terms.
