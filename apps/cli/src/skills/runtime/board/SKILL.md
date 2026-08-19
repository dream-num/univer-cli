---
name: board
description: "Create, edit, chart, read back, and visually verify Board canvas units with the Lite Interface."
---

# Board units

Create a Board on a worktree, then use the returned unit ID for every operation:

```bash
univer unit add canvas.univer --worktree <id> --type board --name "Planning Board" --json
univer execute canvas.univer --worktree <id> --unit <board-id> -e '
const shape = board.insertShape({
  shapeType: api.Enum.ShapeTypeEnum.RoundRect,
  transform: { left: 80, top: 80, width: 180, height: 100 }
});
if (!shape) throw new Error("Cannot insert Board shape");
shape.getText().setText("Review");
return { shapeId: shape.getId(), elements: board.describeElements() };'
univer open canvas.univer --worktree <id>
```

`execute` predefines `univerAPI`, `api`, and the `FBoard` named `board`; do not redeclare them.
`insertShape` accepts the common `IShapeCreateInput`: geometry belongs in `transform`, visual data
belongs in `shapeData`, and text is edited through the returned live handle. It does not accept
top-level `id`, `left`, `top`, `width`, `height`, or `text`; retain `getId()` immediately when later
operations need the generated element id. Inspect the version-matched `FBoard.insertShapes` entry
before batch insertion so the script follows the SDK installed with this CLI.
Use `board.getElements()`, `board.describeElements()`, or `board.save()` for model readback that
confirms persisted structure. For visual confirmation, use the viewer link printed by `open` and
inspect it with an available browser tool.

Resolve additional Board methods and types from the version-matched Facade index:

```bash
univer api show FUniver.createBoard FUniver.getBoard FBoard.insertShape FBoard.insertShapes FShape FBoard.newChart FBoard.insertChart FBoard.getCharts FBoard.getChart FBoardChart FChart
univer api find board shape element
```

## Connectors and layout verification

Create related shapes with `insertShapes()` before creating their connectors. Prefer generated
element IDs and element-bound endpoints; for multi-node diagrams, use `routing: "orthogonal"` and
`routingMode: "auto"` so moving a shape keeps the relationship attached. Use `straight` only for a
short adjacent connection with a visibly clear corridor, `curve` for a self-loop or short feedback
edge, and `freePolyline` only when the requested geometry is intentionally manual.
Choose outward connection sites from the planned geometry instead of relying on defaults: use
`Right → Left` for left-to-right flow and `Bottom → Top` for top-to-bottom flow. Keep feedback edges
on an outer lane and give them sites facing that lane. This reduces crossings before the router runs.

```js
const shapes = board.insertShapes([
  {
    shapeType: api.Enum.ShapeTypeEnum.RoundRect,
    transform: { left: 80, top: 80, width: 180, height: 100 },
  },
  {
    shapeType: api.Enum.ShapeTypeEnum.RoundRect,
    transform: { left: 400, top: 80, width: 180, height: 100 },
  },
]);
if (!shapes) throw new Error("Cannot insert Board shapes");
const source = shapes[0];
const target = shapes[1];
if (!source || !target) throw new Error("Expected two Board shapes");
const connectors = board.insertConnectors([
  {
    fromElementId: source.getId(),
    toElementId: target.getId(),
    fromConnectionSiteId: api.Enum.BoardConnectorSite.Right,
    toConnectionSiteId: api.Enum.BoardConnectorSite.Left,
    routing: "orthogonal",
    routingMode: "auto",
    style: { endMarker: { type: "filledTriangle", size: "md" } },
  },
]);
if (!connectors) throw new Error("Cannot insert Board connectors");
const analysis = board.analyzeModelLayout(48);
if (!analysis) throw new Error("Cannot analyze Board layout");
return { connectorIds: connectors.map((item) => item.id), analysis };
```

Treat `element-overlap`, `connector-through-element`, and `connector-collinear-overlap` as blocking;
treat `connector-crossing` as a warning that still needs local review. Model analysis deliberately
reports an auto connector without persisted route points as unresolved. Do not infer that it is
clear: browser rendering owns its final route.

Endpoint lint applies to every Board connector, not only sequence diagrams.
`connector-free-endpoint-near-element` means a free start/end lies within the normal snap threshold
of a connectable element. Repair the endpoint with `board.setConnectorConnection()`: use the
existing shape-site or shape-boundary endpoint contract for ordinary shapes. A
`connector-free-endpoint-near-dashed-connector` warning means a horizontal message-like endpoint
is using a vertical dashed connector as a likely fake lifeline. Rebuild that participant with
`api.Enum.BoardSequenceShapeType`, then patch the reported start or end with
`{ kind: "lifeline", shapeId, offsetY }`. Both are analysis warnings, not insertion parameter
errors. `normalizeConnectorRouting()` does not repair endpoint semantics and must not substitute
for rebinding them.

Specify connector intent, marker type/size/offset, and routing mode; do not hand-calculate arrow
depth or terminal-leg length. Render geometry accounts for marker paint bounds, stroke width,
endpoint gap, rounded corners, and dash phase. For orthogonal auto connectors without manual
waypoints or route points, the router reserves marker-aware terminal space without changing the
connector type. Imported or explicitly manual routes keep their topology: rendered lint reports
`connector-marker-target-overlap`, `connector-marker-corner-overlap`, `connector-marker-collision`,
`connector-terminal-stem-too-short`, or `connector-terminal-dash-discontinuity` when their visual
configuration does not fit. Treat marker target/corner overlap and marker collision as errors;
review terminal stem and dash continuity warnings instead of repeatedly normalizing the route.

Run the full screenshot with `--json` to materialize the renderer. Read
`outputs[0].layoutAnalysis`, not the model's unresolved route, as the final routing evidence. Every
rendered issue includes `connectorIds`, `elementIds`, `bounds`, and a padded `focusBounds` ready for
the next `--region` call.

Collect the connector IDs named by rendered issues and call
`board.normalizeConnectorRouting(["<connector-id>"])` at most once for that set. Connectors already
using orthogonal auto routing are a safe no-op. The command preserves endpoints, labels, markers,
style, container, and lane identity while resetting only route state. Re-run the full
`screenshot --json` once and inspect its new `layoutAnalysis`; do not loop or move unrelated
elements automatically. When connectors change, a non-null `affectedBounds` covers the old
connector and both bound endpoint elements and can be passed directly to `--region`; a no-op returns
`null`.

Use each remaining issue's `focusBounds` for readable evidence, or capture a connector together with
its endpoint nodes. Then finish with the full Board overview:

```bash
univer screenshot canvas.univer --worktree <id> --unit <board-id> \
  --out ./board-overview --json
univer screenshot canvas.univer --worktree <id> --unit <board-id> \
  --region <left,top,width,height> --scale 2 --out ./board-review --json
univer screenshot canvas.univer --worktree <id> --unit <board-id> \
  --elements <connector-id>,<source-id>,<target-id> --padding 48 --scale 2 \
  --out ./board-review --json
```

## Images

Images may come from user-provided assets or the built-in SVG resource library. For built-in assets,
use `univer resources registries`, `univer resources find`, and `univer resources export`, then pass
the exported SVG as a data URI to `board.insertImage()` with
`imageSourceType: api.Enum.ImageSourceType.BASE64`.

## Native charts

Native Board charts are owned directly by `FBoard`. Build detached chart information, then await
insertion to obtain a live `FBoardChart`:

```js
const info = board
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
  .setAbsolutePosition(80, 80)
  .setSize(640, 360)
  .build();
const inserted = await board.insertChart(info);
return { chartId: inserted.getId(), info: inserted.getInfo(), data: inserted.getDataSource() };
```

`board.getCharts()` and `board.getChart(id)` return live charts. Common setters such as
`setTitle()`, `setAbsolutePosition()`, and `setSize()` update the live chart; await
`chart.setDataSource(values)` for data changes. For one complete replacement, build a detached copy
with `chart.toBuilder()`, call `.build()`, then `await chart.update(info)`. Remove it with
`await chart.remove()` and check the returned boolean. Await `insertChart`, `setDataSource`,
`update`, and `remove` before `execute` returns.

Verify each operation in a fresh no-write `execute` with
`board.getCharts().map((item) => ({ id: item.getId(), type: item.getType(), info: item.getInfo(), data: item.getDataSource() }))`.
For an update, confirm the chart ID, count, type, title, position, size, and data. For a removal,
confirm the chart is absent. Use
`board.describeElements()` or `board.save()` for element readback and the viewer link for visual
confirmation.

Mind maps, tables, ink, and other advanced editing remain outside this Skill's verified authoring
contract.
