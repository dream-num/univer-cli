# Univer CLI

[简体中文](README.zh-CN.md)

Create, edit, inspect, convert, and render office content from the command line.

Univer CLI is designed for coding agents and local automation. Its single `univer` command works with Sheet, Doc, Slide, Base, and Board content stored in local `.univer` files. Changes can be developed, reviewed, and merged in isolated worktrees, while interactive commands also provide stable JSON output for programs.

## Highlights

- **Create and edit** — create Univerfiles and Units, execute trusted Univer Facade code, and commit changes.
- **Structured inspection** — read workbooks, worksheets, ranges, documents, paragraphs, presentations, and slides instead of scraping UI text.
- **Office exchange** — import XLS, XLSX, XLSM, CSV, TSV, DOC, DOCX, PPT, and PPTX; export XLSX, CSV, TSV, DOCX, and PPTX.
- **Reviewable collaboration** — isolate changes in worktrees with `draft`, `ready`, `reopen`, `merge`, and `discard` lifecycle states.
- **Real rendering** — capture content in a browser runtime and lint Slide layouts using actual glyph geometry.
- **Agent interface** — consume stable `--json` output, offline API reference, and version-matched operational Skills.
- **Local first** — Univerfiles, the Gateway, Viewer, daemon, and browser cache stay on the local machine.

## Quick start

Univer CLI requires Node.js 22.12 or later and the pnpm version declared by this repository.

```bash
pnpm install --frozen-lockfile
pnpm link:cli
univer --help
```

Import an existing Office document, inspect its status, and open it in the Viewer:

```bash
univer import ./sales.univer --file ./sales.xlsx --json
univer status ./sales.univer --json
univer open ./sales.univer
```

The editable trunk Viewer can also import an Office file as a new Unit, export Sheet, Doc, Slide, and Base Units, and print supported Units from the Ribbon. A trunk Sheet exposes time-grouped version history. Read-only viewers can inspect history, while editable viewers can explicitly restore a version. Worktree and merge-preview views do not expose history or import/export. Other supported Units remain printable; Board supports printing only.

All content writes happen in a draft worktree:

```bash
univer worktree add ./sales.univer --name agent --json
univer execute ./sales.univer --worktree <worktree-id> --unit <unit-id> \
  -e 'workbook.getActiveSheet().getRange("A1").setValue("done");' --json
univer inspect range A1 ./sales.univer --worksheet name:Sheet1 \
  --unit <unit-id> --worktree <worktree-id> --json
univer worktree ready ./sales.univer --worktree <worktree-id>
univer worktree merge ./sales.univer --worktree <worktree-id>
```

## Command overview

| Area                    | Commands                               |
| ----------------------- | -------------------------------------- |
| Univerfile              | `new`, `open`, `status`                |
| Data exchange           | `import`, `export`                     |
| Collaboration           | `worktree`, `unit`, `execute`          |
| Inspection              | `inspect`                              |
| Rendering and quality   | `screenshot`, `lint`                   |
| Authoring               | `compile-svg`, `compile-typst`         |
| Resources and reference | `resources`, `api`, `skills`           |
| Data maintenance        | `optimize`                             |
| Local environment       | `config`, `doctor`, `daemon`, `update` |

See [`apps/cli/README.md`](apps/cli/README.md) for the complete command, option, selector, environment-variable, and machine-output contracts. You can also run:

```bash
univer <command> --help
```

## Data and security

A `.univer` file is a SQLite container that stores content Units, revisions, worktrees, local resources, and a rebuildable History index. New files use the v2 format. Supported v0 and v1 inputs are upgraded through read-only identification, a complete backup, independent candidate verification, and atomic replacement; a failed upgrade never overwrites the source. See [`docs/data-compatibility.md`](docs/data-compatibility.md) for the complete contract.

The bundled Univer runtime development license is an application runtime credential authorized for public redistribution with this application. It is limited to localhost, rotates every 90 days, and is separate from the repository software license. Override it with `UNIVER_LICENSE` or the `univerRuntime.license` configuration key.

## Architecture

Univer CLI is built on the Univer CLI SDK. Standard commands and reusable capabilities come from installed CLI SDK packages and are assembled explicitly by this application. This repository owns local product behavior such as files, paths, processes, the Gateway, and data upgrades.

| Boundary          | Responsibility                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Univer CLI SDK    | Command presets, daemon, execution, inspection, rendering, linting, authoring helpers, configuration, and API reference |
| Univer SDK        | Unit model, Facade, formula engine, Sheet, Doc, Slide, Base, Board, Office exchange, and rendering engine               |
| Collaboration SDK | Snapshot, changeset, Worktree, service, transport, client, and persistence contracts                                    |
| This repository   | `.univer` persistence, local adapters, Gateway, Viewer, runtime composition, data upgrades, and diagnostics             |

[`apps/cli/src/program.ts`](apps/cli/src/program.ts) is the only composition root and registers commands explicitly through Commander `addCommand()`. See [`docs/architecture.md`](docs/architecture.md) for ownership, runtime topology, and dependency rules.

## Workspace

```text
apps/cli/                           # public univer-cli application
packages/collab-gateway/            # local Collaboration SDK Gateway
packages/collab-gateway-contract/   # Gateway and Viewer control-plane contract
packages/collab-web/                # browser Viewer
packages/importrange-formula/       # cross-Unit formula plugin
packages/render-preset/             # shared Univer browser composition
packages/render-runtime-client/     # CLI SDK Render Page bundle entry
packages/univerfile-sqlite/         # .univer persistence and safe upgrades
docs/                               # architecture, data contracts, and maintenance rules
```

`apps/cli` is the only public application. The `packages/*` projects are private support packages, not parallel products.

## Development

```bash
pnpm build       # build the CLI, daemon, runtime worker, Viewer, and render runtime
pnpm test        # run workspace tests
pnpm check       # format, lint, typecheck, locale, build, test, and package checks
```

Stop the daemon before unlinking a local development build:

```bash
univer daemon stop
pnpm unlink:cli
```

The source manifest keeps the sentinel version `0.0.0`. Univer CLI stays on the `0.5.x` release line and uses `alpha`, `insiders`, and `dev` channels. Alpha is the only channel eligible for later external promotion and is triggered by a matching `v0.5.x-alpha.<suffix>` tag. Insiders releases are dispatched manually from the default branch. All three channels currently publish only to insider-npm; this repository does not include a public npm promotion workflow.

```bash
pnpm release:cli -- --channel=insiders --version=0.5.0-insider.example --dry-run
```

The local-only `dev` channel permits a dirty worktree and skips the SDK cohort check:

```bash
pnpm release:cli -- --channel=dev --version=0.5.0-dev.example --publish
```

Each channel produces a release manifest, package audit, isolated-install verification report, and tarball under `.release/`. These artifacts do not enter repository history. Application code is shipped unobfuscated as open source from the `0.5.x` line; SDK implementations remain behind their published package boundaries.

## License

Repository source is licensed under [Apache-2.0](LICENSE). Univer Pro SDK packages, runtime credentials, native bindings, and other third-party components retain their own terms.
