---
name: cross-unit-formula
description: "Author, calculate, update, inspect, and verify cross-Unit formulas in Sheet cells or Shapes with explicit Sheet or Base sources."
---

# Cross-Unit formulas

A cross-Unit formula has two supported consumers: a Sheet cell, or a regular Shape in a Sheet, Doc,
Slide, or Board whose displayed text comes from the formula result. Load `core` plus the Host and
Sheet or Base Source Unit Skills first. Those Unit Skills own Unit-local coordinates, content, and
visual behavior; this Topic Skill owns the external Source binding, formula, calculation, and
cross-Unit verification.

## Resolve the public API

```bash
univer api show FRange.setFormula FShape.setFormula FShape.getFormulaResult FShape.removeFormula FFormula.buildReference FFormula.upsertExternalReference FFormula.onCalculationResultApplied
```

Use explicit host and source handles. In a headless task, do not select either Unit through a
`getActive*()` method. Resolve both handles by the Unit IDs selected in the host and source Unit
workflows, for example `univerAPI.getWorkbook(hostUnitId)`,
`univerAPI.getWorkbook(sourceUnitId)`, or `univerAPI.getBase(sourceUnitId)`.

## Reference contract

- The caller supplies the source Unit. `buildReference()` serializes a reference; it does not
  discover or list Units.
- Use a Unit ID only to resolve the Unit and provide stable identity. Always use
  `sourceUnit.getName()` as `formulaQualifier`, because formulas address Units by name.
- Use `SHEET_RANGE` for a Sheet range and `TABLE_COLUMN` for a Base table column. Let
  `buildReference()` quote and escape Unit, sheet, table, and column names.
- Sheet cell formulas and formula-driven Shapes read the same Host external-reference metadata. A
  mapping written by `buildReference()` is therefore shared by both consumers.
- A cell reads that persisted mapping directly. For a Shape, pass the formula and its complete
  external Source identity list to `setFormula()`.
- Subscribe to calculation completion before `setFormula()` or before changing referenced data,
  then await it before reading the result.

## Sheet Source binding

Resolve both Units explicitly and build the reference once in the Host context:

```js
const hostUnit = univerAPI.getWorkbook("<host-sheet-unit-id>");
if (!hostUnit) throw new Error("Host Sheet Unit was not found.");
const hostSheet = hostUnit.getSheetByName("Dashboard");
if (!hostSheet) throw new Error("Host sheet Dashboard was not found.");

const sourceUnit = univerAPI.getWorkbook("<source-sheet-unit-id>");
if (!sourceUnit) throw new Error("Source Sheet Unit was not found.");
const sourceSheet = sourceUnit.getSheetByName("Orders");
if (!sourceSheet) throw new Error("Source sheet Orders was not found.");

const formula = univerAPI.getFormula();
const reference = formula.buildReference({
  hostUnitId: hostUnit.getId(),
  unit: {
    unitId: sourceUnit.getId(),
    formulaQualifier: sourceUnit.getName(),
  },
  target: {
    kind: univerAPI.Enum.FormulaReferenceType.SHEET_RANGE,
    sheetName: sourceSheet.getSheetName(),
    range: { startRow: 1, endRow: 3, startColumn: 1, endColumn: 1 },
  },
});
```

## Sheet cell consumer

Continue in the same execution by subscribing before the write:

```js
const targetCell = hostSheet.getRange("C1");
const applied = formula.onCalculationResultApplied(30_000);
targetCell.setFormula(`=SUM(${reference})`);
await applied;
return { formula: targetCell.getFormula(), value: targetCell.getValue() };
```

## Formula-driven Shape consumer

Use the Host Unit Skill to create a regular Shape, then bind it to the same reference and Source
identity. The Facade retains Formula Shape method and enum names; they are API details, not a
separate authoring workflow.

```js
const shape = hostSheet.insertShape({
  shapeType: univerAPI.Enum.ShapeTypeEnum.Rect,
  transform: { left: 700, top: 240, width: 280, height: 72 },
});
if (!shape) throw new Error("Formula-driven Shape could not be inserted.");

const applied = formula.onCalculationResultApplied(30_000);
shape.setFormula({
  formula: `=SUM(${reference})`,
  externalReferences: [
    {
      qualifier: sourceUnit.getName(),
      sourceUnitId: sourceUnit.getId(),
      sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
    },
  ],
});
await applied;

const result = shape.getFormulaResult();
if (result?.status !== univerAPI.Enum.FormulaShapeResultStatus.SUCCESS) {
  throw new Error(`Formula-driven Shape failed: ${JSON.stringify(result)}`);
}
return { shapeId: shape.getId(), formula: shape.getFormula(), result };
```

## Base Source binding

For a Base Source, keep the Host and selected consumer unchanged and build a table-column
reference:

```js
const sourceUnit = univerAPI.getBase("<source-base-unit-id>");
if (!sourceUnit) throw new Error("Source Base Unit was not found.");

const reference = univerAPI.getFormula().buildReference({
  hostUnitId: hostUnit.getId(),
  unit: {
    unitId: sourceUnit.getId(),
    formulaQualifier: sourceUnit.getName(),
  },
  target: {
    kind: univerAPI.Enum.FormulaReferenceType.TABLE_COLUMN,
    tableName: "Budget",
    columnName: "Amount",
  },
});
```

`tableName` must be the Source Base's real OOXML table identifier and `columnName` must
match the real field name. Never pass `"table"` as a generic placeholder. Resolve the Source table
from Base metadata first; `buildReference()` owns qualifier quoting and escaping.

Use that `reference` in the Sheet cell recipe above. For a formula-driven Shape, pass the Base
identity with it:

```js
const applied = univerAPI.getFormula().onCalculationResultApplied(30_000);
shape.setFormula({
  formula: `=SUM(${reference})`,
  externalReferences: [
    {
      qualifier: sourceUnit.getName(),
      sourceUnitId: sourceUnit.getId(),
      sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_BASE,
    },
  ],
});
await applied;
```

`hostUnit` above is the explicit Sheet workbook, Document, Presentation, or Board that owns the
Shape.

## Existing formula text

For hand-written, imported, or batch formula text, persist the same Host mapping before writing the
formula and fail when the mapping is rejected:

```js
const qualifier = sourceUnit.getName();
const bound = formula.upsertExternalReference({
  unitId: hostUnit.getId(),
  qualifier,
  sourceUnitId: sourceUnit.getId(),
  sourceUnitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
});
if (!bound) throw new Error("Cross-Unit Source binding failed.");
const applied = formula.onCalculationResultApplied(30_000);
hostSheet.getRange("C1").setFormula(`=SUM('[${qualifier}]Sheet1'!B2:B10)`);
await applied;
```

Use `UNIVER_BASE` for a Base Source. The qualifier in formula text and metadata must match exactly.
When an upsert rebinds an existing qualifier, write the formula for the current authoring operation
after the upsert and await calculation. `executeCalculation()` recalculates compiled formulas but
does not by itself reparse every existing formula against the new Host binding. Prefer
`buildReference()` whenever names need quoting or escaping.

## Host differences

| Host  | Create a regular Shape       | Read it again by stable ID    |
| ----- | ---------------------------- | ----------------------------- |
| Sheet | `worksheet.insertShape(...)` | `worksheet.getShape(shapeId)` |
| Doc   | `document.insertShape(...)`  | `document.getShape(shapeId)`  |
| Slide | `slide.insertShape(...)`     | `slide.getShape(shapeId)`     |
| Board | `board.insertShape(...)`     | `board.getShape(shapeId)`     |

Once a live `shape` exists, the formula API is identical for every host. Follow the host Unit Skill
for coordinates, page or sheet selection, styles, and host-specific visual checks. Fully qualify the
source through `buildReference()` so the formula does not depend on an implicit host context.

## Update and remove

`FRange.setFormula()` replaces a cell formula. `FShape.setFormula({ formula,
externalReferences })` replaces a Shape formula. Both schedule calculation. A referenced Source
mutation also schedules recalculation; subscribe first and await the next result:

```js
const applied = univerAPI.getFormula().onCalculationResultApplied(30_000);
sourceSheet.getRange("B2").setValue(750);
await applied;
const updated = shape.getFormulaResult();
```

Format and animation belong only to the formula-driven Shape:

```js
shape.setFormulaNumberFormat("$#,##0.00");
shape.setFormulaAnimationEnabled(false);
```

`shape.removeFormula()` converts it back to a regular Shape while preserving its existing Shape
content and styles. Use the host Unit Skill's deletion API only when the Shape itself should be
removed.

## Acceptance

After the final mutation:

1. For a cell, resolve a fresh range handle and assert the exact formula plus expected cached value.
2. For a Shape, resolve a fresh handle by stable ID, then assert `isFormulaShape()`, the exact
   `getFormula()`, and a successful `getFormulaResult()` with the expected raw `value`,
   `displayText`, and `numberFormat`.
3. Change one referenced Source value, await calculation, and prove the selected consumer changed as
   expected.
4. Follow the Host Unit Skill's screenshot or viewer workflow. Confirm that the View opens, the
   selected cell or Shape renders, the UI remains responsive, and the page has no runtime error.
   When the opened View has the referenced Source available, also confirm the updated display; for
   a Shape, verify number format, geometry, and clipping too.
5. Complete the `core` worktree readback, ready, and viewer handoff workflow.

Headless model readback is the calculation evidence for a cross-Unit task. Browser View availability
of an unloaded external Source is product-dependent; do not claim that path from visual evidence
unless the opened product actually resolves it. The task is complete only when the evidence required
for the selected runtime and View agrees.
