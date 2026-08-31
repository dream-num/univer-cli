---
name: core
description: "Drive .univer office files from the terminal with the univer CLI — import xlsx/csv/pptx/docx, explore read-only (inspect), read & write via Univer facade code (execute) on a worktree, export xlsx/csv/pptx/docx, hand off a viewer link. Use when a task involves reading or editing .univer / .xlsx / spreadsheet data, .pptx / slide decks / presentations, or .docx / documents, or needs the correct Univer cell model (stored value v, type t=1/2/3/4, formulas, number formats, ranges)."
---

# Univer CLI Core

`univer` reads and edits sheet, slide, doc, Base, and Board units inside `.univer` files and converts office units to and from xlsx, csv, pptx, and docx. Use it for office-file, database, and canvas tasks.
**If `univer` is unavailable, stop and report that the environment is not installed. Do not fall back to openpyxl, python-pptx, python-docx, zip manipulation, or another writer.**

## SVG resources

When a Unit needs icons, logos, emoji, or illustrations, use the built-in SVG resource library:

```bash
univer resources registries
univer resources find <query> [<query>...]
univer resources export <handle> [<handle>...] --out <directory>
```

## Mental model

- A `.univer` file is a multi-unit container. Each sheet workbook, slide presentation, document, Base database, or Board canvas unit has a `unitId`.
- Each file has two scopes: `trunk` is the human-facing main line; a `worktree` is the isolated copy where an agent works before review.
- Every content command must provide the full address: `<file.univer>` + `--worktree <id>` for writes + `--unit <id>`. There is no default unit, even in a single-unit file. Obtain unit IDs from `unit list` or `import`. Worktrees are also addressed only by ID; `--name` creates a display label, not an address.
- Writes happen on a `draft` worktree. `execute` requires `--worktree` and automatically persists only when a mutation occurred. There is no save command. A `ready` worktree rejects writes until it is explicitly reopened. Read-only code creates no revision and changes no state. Use `inspect` for read-only exploration and always select exactly one scope with `--trunk` or `--worktree <id>`; `execute` runs only on a worktree.
- `worktree merge` is the only path into trunk. A conflict exits with code 1 and leaves trunk unchanged. Merge is normally a user decision, not an automatic agent step. `merged` and `discarded` are terminal states; never reuse them. Run `worktree list` before continuing existing work.

## Required reading before editing

Load the matching unit Skill through the same CLI before writing Facade code; never rely on memory:

- sheet unit → `univer skills get sheet`
- slide unit → `univer skills get slide`
- doc unit → `univer skills get doc`
- Base unit → `univer skills get base`
- Board unit → `univer skills get board`
- Embed one Unit inside another → load both Unit Skills, then `univer skills get embed`
- Read another Unit from a Sheet cell or formula-driven Shape → load the Host and Source Unit Skills,
  then `univer skills get cross-unit-formula`
- Feed a Chart from another Unit's range → load the Host Unit Skill and the Sheet or Base Unit Skill,
  then `univer skills get embed` (see "Referencing another Unit's data from a Chart")

## Typical worktree edit

```bash
univer import --file in.xlsx wb.univer
univer worktree add wb.univer --name task
univer execute wb.univer --worktree <id> --unit <u> -e '…'
univer inspect range A1:C9 wb.univer --worksheet name:Sheet1 \
  --worktree <id> --unit <u> --json
```

Use `-e` for short one-line code and `--script` for multiline code. Explicitly `return` readback
values; bare expressions and `console.log` do not populate the CLI `value`. The execution sandbox
has no Node.js `require`, and read-only code creates no revision.

After the readback is correct, follow "Finish the task" below.

## Finish the task

If you changed a worktree:

1. Verify the result after the last change.
2. Run `univer worktree ready <file.univer> --worktree <id>`.
3. Run `univer status <file.univer> --worktree <id> --json` and confirm the status is `ready`.
4. Run `univer open <file.univer> --worktree <id>`.
5. Give the viewer URL to the user and identify it as worktree `<id>`.

If you make another change, repeat these steps.

Tasks completed without worktree changes leave all worktree states unchanged. For a trunk result,
run `univer open` without `--worktree` and give that viewer URL to the user, identifying it as trunk.

When `univer open` fails, report its diagnostic and the exact failed command so the user can retry it.

Merge only when the user asks.

## Rework after user feedback

Continue in the same worktree only when the user asks for changes to the same task and the worktree
ID is already known. Run `univer worktree list <file.univer>` first and confirm that
worktree is still `ready` or `draft`. Never reuse a `merged` or `discarded` worktree; create a new
worktree instead.

For a `ready` worktree, explicitly reopen it before making any content change:

```bash
univer worktree reopen <file.univer> --worktree <id>
```

This is the only `ready` → `draft` transition. Reopen does not create a content commit. If the
worktree is already `draft`, continue directly without running reopen.

The rework loop is:

1. Run the explicit `worktree reopen` command above for the known `ready` worktree, or continue
   directly if it is already `draft`.
2. Make the remaining edits in that same worktree and verify the updated result.
3. Follow "Finish the task" again: mark it `ready`, confirm the state, open it, and return the new
   viewer handoff to the user.

## Command map

Use `univer <command> --help` as the syntax authority.

| Stage    | Command                                  | Use                                                                                                                                                                                                                     |
| -------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start    | `new` / `import`                         | Create an empty file or import xlsx, csv, pptx, docx, or URL content; import prints the unit ID.                                                                                                                        |
| Start    | `unit add\|remove\|list`                 | Unit lifecycle. These are the only lifecycle verbs. Use `--type sheet\|slide\|doc\|base\|board`; edit with `execute`; rename is unsupported.                                                                            |
| Start    | `worktree add` / `worktree list`         | Create an isolated worktree and check existing states.                                                                                                                                                                  |
| Start    | `status`                                 | Show units and worktree states together.                                                                                                                                                                                |
| Write    | `execute`                                | Primary read/write surface; requires `--worktree` and `--unit`; accepts `-e`, `--code`, or `--script`.                                                                                                                  |
| Write    | `compile-svg`                            | The slide element-generation path: compile SVG to Facade operations and apply it with `--page <n> --apply`.                                                                                                             |
| Write    | `compile-typst`                          | Compile a Typst Source Bundle into a new Doc; inspect JS, diagnostics, and PNG in build-only mode or commit once with `--apply --worktree`.                                                                             |
| Verify   | `inspect`                                | Read-only exploration for Sheet workbook/range, Doc document/paragraph, Slide presentation/page, Base schema, and Board element structure.                                                                              |
| Verify   | `screenshot`                             | Render PNG evidence. Use it for every slide page and run `screenshot setup` first.                                                                                                                                      |
| Deliver  | `worktree ready\|reopen\|merge\|discard` | Mark work ready for review or explicitly reopen it for same-task rework; the user owns merge.                                                                                                                           |
| Deliver  | `export` / `open`                        | Export xlsx, csv, pptx, or docx; `open` only prints a viewer URL for the user — it never launches a browser.                                                                                                            |
| System   | `daemon status\|start\|stop` / `config`  | Start diagnosis with `daemon status`.                                                                                                                                                                                   |
| Maintain | `optimize`                               | Write a new copy with explicit `--worktrees clean`, `--history reset`, and/or `--images externalize`; history reset implies terminal Worktree cleanup and refuses active Worktrees. Omitted passes preserve their data. |

## Facade API lookup

- No relevant class or API symbol is known: use `univer api find <query...>` with API-name keywords or identifier fragments.
- A class is known: use `univer api show <Class>` to inspect its supported APIs.
- A type or exact `Class.member` symbol is known: use `univer api show <symbol>` for its authoritative signature, documentation, referenced types, and examples.

`find` is case-insensitive. Each query is searched independently and returns its own matches. Queries are not combined as AND, and `find` does not interpret intent.

Pass a useful symbol returned by `find` directly to `show`; do not search for the same symbol again.

`show` accepts one or more exact symbols. When several relevant symbols are already known, pass them in one `show` command instead of issuing one command per symbol.

Only `find` accepts `--unit sheet|slide|doc|base|board`; use it there to reduce irrelevant Unit-specific results while retaining shared APIs. Do not pass `--unit` to `show`. Treat `show` output as authoritative; do not guess signatures, parameter shapes, or enum values.

- The index covers conditional formatting, data validation, filters, sorting, tables, hyperlinks, comments, number formats, charts, pivot tables, shapes, and sparklines. These features use Facade APIs through `execute`; they do not have dedicated commands.
- Enumerations are indexed too. For example, `api show ShapeTypeEnum` lists the declared common Shape values. If an enum is absent from the index, inspect it with `return Object.keys(api.Enum.XxxEnum)`.
- Use `api find/show` as the version-matched Facade contract instead of reading a repository DTS path.
