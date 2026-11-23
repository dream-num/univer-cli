# Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

Univer CLI has one Lite application target. Its npm package is `univer-cli`, and its command and binary are both named `univer`. The Univer CLI SDK supplies standard commands and reusable capabilities. The application installs those packages and registers them explicitly in `apps/cli`. This repository implements the product-specific behavior and its integration with the local environment.

## Layers

```text
univer process
  -> Commander composition root
       -> CLI SDK standard feature
            -> command preset
            -> capability
       -> application-specific feature
            -> application use case
                 -> Univer SDK
                 -> Collaboration SDK
                 -> local storage, process or browser adapter
```

- The composition root registers each standard CLI SDK feature installed as an application dependency.
- Each SDK command preset is a native Commander `Command`. It handles arguments, help, and output. Its capability implements the reusable business rules.
- Application-specific features map paths, environment variables, the Application home, and local output to capability inputs and results. They also implement use cases specific to the local product.
- Application use cases coordinate files, the daemon, Gateway, browser, and SDKs through their APIs.
- The composition root handles all wiring directly, without a separate command registry or dependency injection container.

## SDK boundaries

### Univer SDK

The Univer SDK provides the Unit data models, Facade, formulas, render engine, Office exchange, and the Sheet, Doc, Slide, Base, and Board UI and runtime plugins. Both the CLI and browser applications consume published packages and APIs. Each builds independently of other source checkouts.

### Collaboration SDK

The Collaboration SDK owns changesets, Snapshots, the Worktree persistence contract, services, endpoints, transports, the browser client, and runtime integration. The local transport and persistence implementations in `packages/collab-gateway` and `packages/univerfile-sqlite` follow the SDK's collaboration semantics.

### Univer CLI SDK

The Univer CLI SDK supplies standard capabilities, Commander presets, daemon control, content execution and inspection, layout linting, screenshots, Unit PDF printing, SVG and Typst Facades, the resource library, configuration, API reference, and the collaboration runtime and worker pool. The composition root in `apps/cli` wires these packages into the application and supplies local adapters where needed.

### Application-owned capabilities

This repository owns:

- `.univer` path normalization, format detection, safe upgrades, and SQLite connection management.
- The Application home (`${UNIVER_HOME:-~/.univer}`), configuration paths, browser cache, and daemon socket.
- Daemon identity, Gateway address mapping, runtime workers, and the lifecycle of local processes.
- HTTP(S) import downloads, temporary files, and error reporting that keeps credentials private.
- Mapping Exchange Node formats, formula options, selectors, and errors to CLI operations and persisting the resulting Units.
- Building and copying the browser runtime and making local images available to it.
- Application Skill assets, diagnostics, and redaction rules.

Introduce a port when a second production adapter needs it. A test double alone does not justify one.

## Runtime topology

```text
univer command
  -> application daemon
       -> Collaboration Gateway
            -> one GatewayFileRuntime per opened .univer
                 -> Collaboration SDK services
                 -> @univer/univerfile-sqlite stores
       -> CLI SDK runtime worker pool
            -> headless Univer runtime worker

univer open
  -> Gateway-hosted Viewer
       -> Collaboration SDK browser client
       -> read-only pinned Unit comparison (Trunk or Worktree <-> current Worktree)
       -> trunk-only Universer exchange tasks + all-scope print plugins

univer lint --mode model (Board)
  -> CLI SDK layout lint
       -> standard headless Univer factory
            -> Board model Facade analysis

univer screenshot / print-pdf / lint (Slide / Board rendered) / compile-svg
  -> CLI SDK browser orchestration
       -> packaged render-runtime-client
            -> CLI SDK univer-render-page
                 -> standard Univer SDK render composition
```

The daemon initializes the Gateway at startup. The standard headless Univer setup loads on demand in a content worker or during document creation. A document creation request releases its instance when it finishes.

The daemon manages local services and runtime lifecycles. For rendering, it materializes UnitData, resolves dependencies in the same file, and makes local image assets available to the renderer. CLI SDK capabilities and their runtimes handle PNG and PDF output, layout analysis, and text measurement. Board model-only lint uses the standard headless factory without starting a browser. The rendered and combined modes use the browser runtime. Both analysis stages use the same independent snapshot. The application supplies the source and local resources, and the SDK owns the rules and geometry checks.

Each open `.univer` file has its own Gateway runtime for the Viewer Ribbon's `source=1` exchange uploads, asynchronous import and export tasks, and temporary artifacts. Imports create a Unit in Trunk, and exports materialize the Trunk head. Exchange is available only on Trunk routes. Embedded resources have a separate `source=3` file protocol with access scoped to a Unit and Worktree.

CLI and Gateway Unit exports both use Exchange's `files.load` to resolve embedded images. The CLI reads from the selected Trunk or Worktree, and the Gateway reads from Trunk. PPTX, DOCX, and XLSX exports preserve the original embedded image bytes and use transparent placeholders for URL images. A Gateway export from an uploaded JSON snapshot has no access to local assets.

The Gateway uses the Collaboration SDK's in-process execution for Trunk, Worktrees, and snapshot materialization. Open files share the application daemon's process rather than starting a worker pool per file. CLI Facade execution runs in a separate runtime worker.

The Gateway connects the Collaboration SDK History Service and Endpoint for Trunk revisions. `@univer/univerfile-sqlite` implements History persistence on the file's shared SQLite connection. History tables hold an index derived from Trunk Units and changesets. The History Service rebuilds a missing Unit index on its first read and brings a lagging index up to date on the next commit. File upgrades keep History boundaries at or below the Trunk head. The optimizer prunes intermediate Trunk snapshots while preserving History records. The Viewer registers the standard SDK History UI plugin for each of Sheet, Doc, Slide, Base, and Board on Trunk. Worktree and merge preview views omit the History UI.

Creating a Unit comparison pins both references, their Unit sets, and their heads. The Gateway materializes each side's final snapshot through the Collaboration SDK. With continuous history, it also returns the changesets from the common Trunk revision to each head. A gap in history yields snapshot fidelity. Comparisons are read-only and generate no mutations. The Gateway and Viewer decode Base and Board snapshots through the Gateway contract's `snapshot-data` entry point. It accepts older metadata and block representations and preserves Board resources, Unit IDs, and versions.

Univer Pro History provides semantic comparisons through its Facade and reusable services, independently of the CLI SDK. It aligns Sheet coordinates across both changeset histories and paragraphs and text in Docs. For Slide, Base, and Board it compares stable IDs and properties. A later change to a head or to the set of Units marks the session stale. Its pinned results remain available.

To display Sheet formula source, the application uses the published SDK's `SheetInterceptorService` and `FormulaDataModel`. The adapter returns a disposable render override. The Viewer synchronizes the toggle on both sides. Changing the display preserves snapshots, mutations, and formula results and requires no Unit rebuild. History computes semantic differences independently of the display setting.

The same session exposes UI-independent context with `schemaVersion: 1` through `WorktreeControlClient.getUnitComparisonContext()` and the corresponding `/diff` route. On the first request, the Gateway prepares the pinned diff. Filtering, search, and pagination operate on that result. Each item has an insert, delete, or update operation, a stable ID and path, and locations on both sides. Its `changes` describe leaf differences with relative semantic paths, value types, before and after values, and optional text or formula segments. The `summary | changes | full` projection controls detail while preserving item identity.

The comparison UI uses the same changes for its compact navigation. Coverage and diagnostics identify supported product families and explain any loss of fidelity. CLI SDK and Agent consumers read the comparison contract directly, independently of the Viewer DOM. Doc alignment rows and ordinary items are paginated separately. Sheet mappings use compact row and column intervals so their size does not depend on the full sheet dimensions. Pro History returns `scopes` and `item.scope` for changed worksheets, slides, Base tables, and Board pages. The application selects the current page with `query.scope`. A session shares materialized state and returns copies to consumers so decoding or rendering cannot affect later pages. The application handles localization, tree menus, and synchronized native canvas highlighting. The SDK computes the differences.

The headless collaboration runtime has one writable Host Unit. When Embed encounters a `self` ResourceRef, the application's local provider materializes the child Unit on demand from the Snapshot endpoint scoped to the current file and Worktree, forwarding Embed's child creation options. The child is a read-only dependency in the same Univer instance. The Host owns the changeset state machine, and the runtime loads only the Units it needs.

The Viewer and its `IMPORTRANGE` formula use the Univer SDK package `@univerjs-pro/resources` to parse ResourceRefs and identify range and table selectors. The rendering preset uses the same package's `IAttachmentIoService` token to configure Base attachment I/O.

## Source ownership

`apps/cli/src/program.ts` is the composition root. Features are organized by user capability: `univerfile`, `exchange`, `optimize`, `worktree`, `unit`, `unit-content`, `render`, `lint`, `svg`, `typst`, `markdown`, `doctor`, `skills`, and `update`. Each feature keeps its command, application service, handlers, and private protocol together. Command handlers delegate business logic.

The CLI SDK's `doc-markdown-facade` handles Markdown parsing, Traditional page and section directives, resource validation, source maps, and Modern block replacement by ID. The application creates a Worktree Unit through its in-memory document materialization path and receives the native ID map returned by the program. Partial updates use content execution to validate native block IDs and boundaries before editing. The Univer SDK's native document model remains the persisted representation and supplies the layout for each document flavor. Markdown has no implicit two-way synchronization with collaboration data.

For partial edits, the same capability generates a read-only Facade program that exports Markdown, resources, and an updated map from the current native blocks. Content reads can access a ready Worktree and return content and revision from the same runtime lease without committing a mutation. The revision identifies the version read. Edited fragments replace the blocks identified by the native map. Structures that cannot be represented faithfully produce diagnostics rather than returning stale Markdown.

```text
apps/cli/src/environment/           # Application home, configuration, and local paths
apps/cli/src/daemon/                # Daemon, Gateway, and runtime composition
apps/cli/src/features/              # Application features and local adapters
skills/univer-cli/                  # Discovery Skill installed from this repository
apps/cli/src/skills/runtime/        # Runtime Skills shipped with the CLI
apps/cli/src/runtime-worker.ts      # Headless collaboration worker composition
packages/collab-gateway/            # Collaboration SDK Gateway adapter
packages/collab-gateway-contract/   # Gateway/Viewer control-plane contract
packages/collab-web/                # Collaboration browser application
packages/importrange-formula/       # Cross-Unit formula plugin
packages/render-preset/             # Shared Univer setup for the browser
packages/render-runtime-client/     # CLI SDK Render Page bundle entry
packages/unit-comparison-viewer/    # Read-only Unit comparisons and Sheet coordinate mapping using Pro History results
packages/univerfile-sqlite/         # .univer persistence and safe upgrades
```

Agents install the discovery Skill from `skills/univer-cli/` at the repository root. The CLI packages and reads the runtime Skills. Unit and topic guides live in `apps/cli/src/skills/runtime/` and ship in `dist/skills/runtime/` in the npm package, matching the commands and Facade APIs of the installed CLI version.

## Command composition

The root help uses Commander's native `helpGroup()` to group commands under Univerfile, Data Exchange, Collaboration, Unit Operations, Rendering, Authoring, Resources & Reference, Data Maintenance, and System. These groups organize help independently of source ownership.

Changes to public commands, options, machine output, exit codes, or data contracts require corresponding updates to tests and documentation. A successful `--json` command writes a single command-specific JSON document to stdout. A failure in recognized JSON mode writes a single JSON document to stderr and exits with a nonzero status.

## Dependency rules

- Register standard CLI commands and reusable capabilities from the Univer CLI SDK explicitly in the composition root. Keep their implementation in the SDK.
- Implement application-specific capabilities in this repository, using the Univer SDK for runtime work and the Collaboration SDK for collaboration.
- Consume Univer capabilities through the published packages and APIs of the Univer SDK, Collaboration SDK, or Univer CLI SDK.
- Use `workspace:*` for workspace dependencies. The application builds independently of adjacent checkouts.
- Do not copy SDK source code or implementations from other Univer repositories.
- Keep SDK packages on a consistent set of exact versions managed by workspace manifests, `.npmrc`, and the lockfile.
- The application build records which runtime dependencies remain external to the bundle. The release manifest includes only those audited dependencies.
- The runtime development license is a credential that rotates every 90 days. The repository software license is separate. `apps/cli/src/license.ts` holds the license and key, and `packages/render-preset/src/license.ts` carries the same license for the browser. The daemon resolves the pair, calls `configureExchange` once in-process, and explicitly supplies the credentials to the Gateway's `UniverCollabService` and the runtime worker environment. Workers do not rely on inheriting the host process environment.

## Quality gate

```bash
pnpm check
```

The check covers formatting, linting, type checking, locale freshness, the build, workspace tests, the built executable, Gateway, Viewer and runtime worker integration, browser render smoke tests, and a package dry run.
