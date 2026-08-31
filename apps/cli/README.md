# Univer CLI

[简体中文](README.zh-CN.md)

`univer-cli` provides office-content creation, editing, inspection, exchange, rendering, and collaboration for agents and local automation. Its npm package is `univer-cli`, and its only program and binary name is `univer`.

The application is built on the Univer CLI SDK. Standard commands and reusable capabilities come from installed CLI SDK packages and are assembled explicitly in `program.ts`. This repository owns application-specific behavior such as local files, processes, the Gateway, and data upgrades.

## Commands

```text
univer new <file.univer>
univer open <file.univer>
univer status <file.univer>
univer import <target.univer> --file <local-path|https-url> [--formula-calculation <mode>]
univer export <file.univer> <output.xlsx|csv|tsv|docx|pptx> [--sheet <name>|--table <name>]
univer worktree add|list|ready|reopen|merge|discard ...
univer unit add|remove|list ...
univer execute <file.univer> --worktree <id> --unit <id> -e '<facade-js>'
univer inspect <target> <selectors...> <file.univer> --unit <id> (--trunk|--worktree <id>)
univer lint --file <file.univer> --unit <slide-id> [--worktree <id>] [--pages <pages>]
univer screenshot <file.univer> [--worktree <id>] [--unit <id>] [--out <dir>]
univer screenshot setup [--force]
univer compile-svg <file.svg> ...
univer compile-typst <bundle> ...
univer resources registries|find|export|cache ...
univer api find|show ...
univer optimize <file.univer> (--dry-run|--out <copy.univer>)
univer config path|list|get|set|unset ...
univer doctor [--json]
univer doctor collect [--last <duration>|--since <time>|--all] [--trace-id <id>] [--output <dir>]
univer skills [list] [--json]
univer skills get (<name>|--all) [--full] [--json]
univer skills path [name] [--json]
univer update [--force] [--json]
univer daemon status|start|restart|stop
```

## Local development

Node.js 22.12 or later is required. The workspace resolves Univer CLI SDK, Univer SDK, and Collaboration SDK packages through `.npmrc` and pins the complete dependency graph in the lockfile.

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js new ./book.univer
node apps/cli/dist/bin.js status ./book.univer
node apps/cli/dist/bin.js open ./book.univer
node apps/cli/dist/bin.js doctor --json
node apps/cli/dist/bin.js daemon stop
```

Link the current build as `univer` in the active Node environment:

```bash
pnpm link:cli
command -v univer
univer --help
```

Stop the daemon before unlinking:

```bash
univer daemon stop
pnpm unlink:cli
```

`pnpm build` generates the CLI, application daemon, headless worker used by the CLI SDK runtime pool, and browser render runtime under `apps/cli/dist/render-runtime`. The daemon starts the Gateway, Viewer, and runtime worker on demand. Screenshot and text-measurement browsers exist only for their corresponding operations.

## Core authoring loop

`new` creates an empty Univerfile. Content writes happen only in a `draft` worktree:

```bash
univer new ./book.univer
univer worktree add ./book.univer --name agent --json
univer unit add ./book.univer --worktree <worktree-id> --type sheet --name Plan --json
univer execute ./book.univer --worktree <worktree-id> --unit <unit-id> \
  -e 'workbook.getActiveSheet().getRange("A1").setValue("done");'
univer inspect range A1 ./book.univer --worksheet name:Plan \
  --unit <unit-id> --worktree <worktree-id> --json
univer worktree ready ./book.univer --worktree <worktree-id>
univer worktree merge ./book.univer --worktree <worktree-id>
```

Unit mutations and `execute` are allowed only in a draft worktree. A ready worktree must be reopened before further writes. `execute` uses the CLI SDK content-execution prelude, pulls before execution, captures mutations, commits automatically, and reports the Collaboration revision. Use `-e` for one-line code and `--script` for multiline code. Explicitly `return` readback values; bare expressions and `console.log` do not populate `value`. Read-only code does not create a revision.

`status` and `unit list` read trunk by default and also accept an explicit `--trunk`; use `--worktree <id>` to read a Worktree.

`inspect` supports Sheet workbook/worksheet/range, Doc document/paragraph, Slide
presentation/slide, Base overview, and Board overview/element detail in that order. It uses the CLI
SDK selector grammar: `name:`, `id:`, and 1-based `index:`. Reading a Sheet range requires
`--worksheet`; Board element detail uses `id:` selectors. Every inspection must choose exactly one
scope through `--trunk` or `--worktree <id>`.

## Import and export

`import` uses Univer SDK Exchange Node to import local or HTTP(S) XLS, XLSX, XLSM, CSV, TSV, DOC, DOCX, PPT, and PPTX inputs. The local HTTP adapter streams remote input into a suffix-preserving temporary file, removes it after success or failure, and strips credentials, query strings, and fragments from errors.

Without `--worktree`, import creates a new Univerfile. With a worktree, it writes into that draft. `export` supports Sheet/Base to XLSX, CSV, or TSV; Doc to DOCX; and Slide to PPTX. CSV and TSV use `--sheet` or `--table` to select one output object. `--formula-calculation forced|when_empty|no` controls the Sheet converter formula policy; the compatibility default is `forced`.

The editable `univer open` Viewer can import and export through its Ribbon. Import creates a new Unit in the current Univerfile. Trunk Sheet, Doc, Slide, Base, and Board Units expose their standard SDK version-history UI; read-only viewers can inspect history, while editable viewers can explicitly restore a version. Read-only Sheets do not expose Protect or Print. Worktree and merge-preview views do not expose import, export, or history. Other supported Units remain printable; Board supports printing only.

`optimize` is copy-only. Unless `--dry-run` is used, it requires `--out` and never overwrites the source.

## Rendering and authoring helpers

`screenshot` uses CLI SDK screenshot and render capabilities with application-owned Univerfile, Worktree, browser-cache, and local-asset adapters. Sheet, Base, Doc, Slide, and Board can all be rendered. The default output directory is `./screenshots`.

```bash
univer screenshot setup
univer screenshot ./book.univer --unit <sheet-id> --range A1:H40 --out ./shots
univer screenshot ./book.univer --worktree <id> --unit <slide-id> \
  --pages 1,3-5 --contact-slide --tile 3x2 --out ./shots
univer lint --file ./book.univer --worktree <id> --unit <slide-id> --pages 1,3-5
```

`lint` uses the CLI SDK layout-lint capability and browser glyph geometry to detect `text-off-page`, `text-escapes-container`, and `text-overlaps-text` findings. Findings are review suggestions backed by geometry evidence.

`compile-svg` uses real browser font measurement by default; `--estimate-text-size` opts into deterministic estimation. `compile-typst --apply` materializes a Doc snapshot in memory and writes it as one Worktree Unit. `resources` uses configured resource manifests and stores downloads under `${UNIVER_HOME}/cache/resources`.

## Configuration and processes

`config path/list/get/set/unset` uses the CLI SDK configuration preset. The application registers:

- `collabGateway.port`
- `screenshot.maxPages`
- `screenshot.maxPixels`
- `update.checkOnStartup`
- `univerRuntime.license`

Read commands do not create a configuration file. `set` and `unset` preserve unknown fields.

- Application home is `${UNIVER_HOME:-~/.univer}`, with configuration at `${UNIVER_HOME}/config.json`.
- `UNIVER_COLLAB_GATEWAY_PORT` overrides the Gateway port; the default is `9123`.
- `UNIVER_LICENSE` overrides `univerRuntime.license`. If neither is set, the application uses its bundled 90-day runtime development license.
- The bundled localhost development license is authorized for public redistribution with this application. It rotates every 90 days and is not the repository software license.
- Browser cache is under `${UNIVER_HOME}/browsers`. `UNIVER_RENDER_BROWSER` selects a Chrome/Chromium executable, and `UNIVER_RENDER_BROWSER_CACHE` overrides the cache root.
- `daemon status` is read-only. The application manages only daemon processes whose identity it verifies as its own.
- Daemon startup errors retain their original code and detail. Gateway state, origin, and Viewer URL appear in daemon status.

`update` selects stable or insiders metadata from the current version. Interactive commands refresh the update cache at most once every 24 hours. JSON, non-interactive, help, and version commands do not show update tips. Development links do not self-update.

`doctor` aggregates configuration, daemon, and browser checks. `doctor collect` creates a `0700` directory containing `0600` JSON files and redacts credentials, tokens, licenses, URL user info/query/fragment, and Bearer values.

`skills` reads version-matched application assets from the packaged `dist/skills` directory and never reads a neighboring checkout.

## Data compatibility

New Univerfiles use v2. Supported v0 and v1 files upgrade to v2 when the application first explicitly opens their path. Upgrade performs read-only identification, locking, a byte-for-byte backup, an independent candidate, storage and runtime verification, a source-hash recheck, and atomic replacement. A failure never replaces the source. Reopening v2 is side-effect free.

See the [data compatibility contract](https://github.com/dream-num/univer-cli/blob/main/docs/data-compatibility.md) for details.

## Machine output

A successful command with `--json` writes exactly one command-specific JSON document to stdout, without a global success envelope. When argv has already established JSON mode, a failure writes one JSON document to stderr and exits nonzero:

```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

Text mode, help, version, and parser failures use standard Commander and CLI SDK output.

## Architecture and SDK relationship

- `apps/cli/src/program.ts` assembles CLI SDK command presets and local commands through Commander `addCommand()`.
- Univer SDK provides the Unit model, Facade, formula engine, rendering engine, and browser plugins.
- Collaboration SDK provides Snapshot, changeset, Worktree service, endpoint, transport, client, and persistence contracts.
- Univer CLI SDK provides standard commands, reusable capabilities, Commander presets, daemon, runtime pool, inspection, execution, exchange, rendering, linting, authoring helpers, configuration, and API reference. Installed packages are assembled explicitly at the composition root.
- Application-specific behavior includes paths, Home, daemon/Gateway composition, data upgrades, browser packaging, local I/O, and diagnostics.

See the [architecture document](https://github.com/dream-num/univer-cli/blob/main/docs/architecture.md) for ownership and dependency rules.

## Verification

```bash
pnpm check
```

The quality gate covers formatting, linting, typechecking, locale freshness, builds, workspace tests, the built executable, Gateway/Viewer/runtime worker behavior, browser-render smoke tests, and package contents.

## License

Repository source is licensed under [Apache-2.0](LICENSE). Univer Pro SDK packages, runtime credentials, native bindings, and other third-party components retain their own terms.
