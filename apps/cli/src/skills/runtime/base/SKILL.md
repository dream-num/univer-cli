---
name: base
description: "Create and edit Base database units with the Lite Interface."
---

# Base units

Create a Base on a worktree, then use the returned unit ID for every operation:

```bash
univer unit add data.univer --worktree <id> --type base --name "CRM" --json
```

For an existing unit, use `univerAPI.getBase("<base-id>")`. Resolve exact Base methods and types
from the version-matched Facade index:

```bash
univer api show FUniver.createBase FUniver.getBase FBase
univer api find base table field record view
```

Use `execute` for changes, then read back the model and verify the worktree before handoff.

## OOXML Base table formulas

Base Formula fields must use Excel structured references exactly; do not invent aliases or infer
scope from intent.

- `Table[[#This Row],[Column]]` (or `Table[@[Column]]`) reads one value from the formula
  record's row.
- `Table[[#Data],[Column]]` (or `Table[Column]`) reads the complete data column.
- Unqualified `[@[Column]]` is valid only for the current row of the Host table.
- `table[Column]` is invalid unless `table` is the real table identifier. It is never a generic
  placeholder for the current table.

Resolve every Base table's formula identifier with `table.getFormulaName()`. The identifier may
differ from its display name when that name is duplicated or is not a legal Excel table name:

```ts
const ordersName = orders.getFormulaName();
const pricingName = pricing.getFormulaName();
const lineTotal = orders.addField("Line Total", univerAPI.Enum.BaseFieldType.Formula, {
  field: {
    config: {
      formula: `=${ordersName}[[#This Row],[Quantity]]*${pricingName}[[#This Row],[Unit Price]]`,
    },
  },
  externalReferences: [],
});
```

A qualified `#This Row` reference to another Base table aligns by row position; use it only when
the tables deliberately share row order. For relational data, use a stable key or RecordLink with a
lookup formula instead. Use `#Data` only when an aggregate over all records is intended. After
writing or editing a Formula field, await calculation and read back its computed record values; the
stored formula text alone is not correctness evidence.

For a Base Formula Field that reads a Sheet Source Unit, persist the complete external-reference
binding with the field:

```ts
const base = univerAPI.getBase("<base-id>");
const table = base?.getTableById("<table-id>");
if (!table) throw new Error("Base table not found");

table.addField("Current Total", univerAPI.Enum.BaseFieldType.Formula, {
  field: {
    config: { formula: "=SUM('[Sales Source]Data'!B2:B4)" },
  },
  externalReferences: [
    {
      qualifier: "Sales Source",
      sourceUnitId: "<sheet-unit-id>",
      sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
    },
  ],
});
```

The qualifier in the formula and binding must match. This binding belongs to the Base Formula Field.

Render the opening active table/view as a full Base workbench screenshot:

```bash
univer screenshot data.univer --worktree <id> --unit <base-id> --out ./shots
```

The output is `./shots/view.png` and includes the Base DOM chrome together with the rendered Canvas.
Base screenshot accepts only common screenshot options; it does not accept Sheet ranges or Slide
page selectors.
