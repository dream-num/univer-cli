---
name: base
description: "Create and edit Base database units, tables, fields, records, and views with the Lite Interface."
---

# Base units

## Model

A Base is one Unit inside a `.univer` file:

```text
FUniver
└── FBase
    └── FBaseTable
        ├── FBaseTableField   schema and value contract
        ├── FBaseTableRecord  stored business data
        └── FBaseTableView    projection of the same table records
```

- Resolve `FBase` by Unit ID. Tables own their fields, records, and views; views only add filter,
  sort, group, visibility, and type-specific presentation.
- The primary field is the record's visible identity for links, cards, and details. Define it with
  `insertTable(..., { primaryFieldName })` instead of adding a duplicate label field.
- Use stable Unit/Table/Field/Record/View IDs in Facade relationships and user-facing names for
  display. Record values and view config normally refer to Field IDs.
- `table.getFormulaName()` is only the structured-reference name for formulas; it may differ from
  the table's display name.

## Entry

The CLI owns Unit and Worktree lifecycle; the Facade owns Base content:

```bash
univer unit add data.univer --worktree <worktree-id> --type base --name "CRM" --json
univer inspect base data.univer --worktree <worktree-id> --unit <base-unit-id> --json
univer execute data.univer --worktree <worktree-id> --unit <base-unit-id> -e '…'
```

`execute` predefines `univerAPI`, `api`, and the `FBase` named `base` for the selected Unit. Use
`base` directly; these bindings are reserved and must not be redeclared.

Do not call `createBase()` after `unit add` just to obtain a handle. A new Base already contains
`Table 1` with a primary `Name` field and `Grid`; `insertTable()` also creates a Grid. Run
`inspect base` first, then deliberately reuse, rename, or delete defaults.

## Exact API

```bash
univer api show FUniver.getBase FBase FBaseTable FBaseTableField FBaseTableRecord FBaseTableView
univer api show FEnum.BaseFieldType FBase.insertTable FBaseTable.addField FBaseTable.addRecords FBaseTable.createView
univer api show IGridViewConfig ICalendarViewConfig IGalleryViewConfig IGanttViewConfig IKanbanViewConfig ICardLayoutConfig
```

Use focused discovery such as `univer api find recordLink --unit base`. Follow every referenced
child type: if a result says `card?: ICardLayoutConfig`, run `api show ICardLayoutConfig` instead of
guessing its shape.

## Core contracts

- Add fields one at a time with `FBaseTable.addField(...)`; there is no `addFields` method.
- Single/MultiSelect options use `{ id, name, color? }`; records store option IDs, not labels.
- Progress values follow its configured range: with `{ start: 0, end: 100 }`, 75% is `75`, not
  `0.75`.
- Money uses `BaseFieldType.Currency` and numeric values; Number is not a semantic substitute.
- RecordLink config targets a Table ID and stores target Record IDs. Prefer its dedicated Facade
  methods when editing links.
- View config uses Field IDs. Kanban/Gallery card title and fields follow `ICardLayoutConfig`;
  `fieldSettings` does not replace the card contract.

## Verify

After the last write, check:

1. `univer inspect base ... --json` for tables, primary fields, field types and config, record counts,
   and view types. It is read-only and accepts no selector.
2. Record readback plus `view.getConfig()` / `view.getProjection()` for stored IDs and view bindings.
3. The rendered required views for blank labels, exposed IDs, implausible dates/percentages, missing
   card fields, and empty defaults.

```bash
univer screenshot data.univer --worktree <worktree-id> --unit <base-unit-id> --out ./shots
```

The Base screenshot is `./shots/view.png`; it does not accept Sheet ranges or Slide selectors.

For Formula fields, run `univer skills get base --full` and follow `references/formulas.md`.
