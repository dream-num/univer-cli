---
name: board
description: "Plan, create, edit, chart, read back, and visually verify Board canvas units with the Lite Interface."
---

# Board units

Create a Board on a worktree, then use the returned unit ID for every operation:

```bash
univer unit add canvas.univer --worktree <id> --type board --name "Planning Board" --json
univer inspect board canvas.univer --worktree <id> --unit <board-id> --json
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

## Semantic diagram planning

For a new relationship-heavy Board, first write a semantic BoardSpec in JSON, then realize it with the existing
Facade APIs. Use this planning step for UML, ERD, flowcharts, architecture/data-flow diagrams, mind maps, and
swimlanes. Skip it for a small freeform canvas, a sticky-note cluster, isolated media, or direct ink editing.

BoardSpec describes intent and structure, not rendering. Keep coordinates, colors, concrete shape types, connector
ports/routes, and animation modes out of it. The agent chooses those after inspecting the installed API and the
current Board. Do not pass BoardSpec to the SDK: it is an authoring artifact, not a Facade input or persisted Board
model.

Before authoring or realizing a semantic diagram, read `references/board-spec.md`. It defines the compact contract,
profile-to-API routing, structural checks, mixed-content behavior, and connector-animation decision rule.
For a multi-profile generation request or a skill coverage audit, also read `references/diagram-review.md` for
profile-specific evidence and the distinction between a generated example and complete feature coverage.

## Completion gate

A generated Board is complete only after all of the following evidence is clean:

1. Read back the persisted elements and run `board.analyzeModelLayout(48)`.
2. Run a full `univer screenshot ... --json` and inspect `outputs[0].layoutAnalysis`.
3. Resolve every blocking issue and review each warning with a focused screenshot.
4. If routing issues identify ordinary connectors, normalize only those connector IDs at most once, then
   rerun the full screenshot.
5. Finish with a clean full-Board screenshot and a final model readback.

Command success, model-only analysis, or a cropped screenshot is not completion evidence. A Board
may be temporarily invalid while it is being edited; apply this gate before final handoff.
For layout-owned branches or sequence-frame intersections, use the semantic review in
`references/diagram-review.md`; retain any reviewed diagnostic exceptions in the handoff instead of claiming clean lint.

`inspect board` is a selector-free overview of ordered elements, counts, bounds, relationships, and
text summaries. Use `inspect board-element id:<element-id> ...` for type-specific detail without
loading the full Board snapshot. Both commands are read-only; use them before editing to discover
existing IDs and after editing to verify persisted structure.

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
univer api show FUniver.createBoard FUniver.getBoard FBoard.insertShape FBoard.insertShapes FBoard.arrangeElementsInLayers FBoard.insertConnector FBoard.insertConnectors FBoard.insertClassRelation FBoard.insertClassRelations FBoard.insertEntityRelation FBoard.insertEntityRelations FBoard.insertSequenceMessage FBoard.insertSequenceMessages FBoard.getConnectorLabels FBoard.setConnectorLabels FBoard.updateConnectorLabel FBoard.createContainer FBoard.createSwimlane FBoard.insertTable FBoard.insertMindMap FShape BoardCustomShapeType BoardSequenceShapeType BoardTableDiagramPreset FBoard.newChart FBoard.insertChart FBoard.getCharts FBoard.getChart FBoardChart FChart
univer api find board shape element
```

Choose native diagram primitives before generic rounded rectangles. Flowchart shapes communicate process semantics;
`BoardSequenceShapeType` provides editable lifelines and activation bars; Board table presets provide UML class,
sequence-fragment, and ERD structures; custom Board shapes provide actors, components, interfaces, storage, and state
symbols. Use `createSwimlane()` for lanes, `createContainer()` for nested scopes and system boundaries, and
`insertMindMap()` for mind maps, trees, or timelines. Query every selected symbol before generating code because the
installed CLI and SDK are the source of truth.

An indexed type is not proof that its runtime enum or helper is exposed. Probe selected runtime methods and
`api.Enum` entries in a read-only `execute` before a large batch. If a semantic helper is unavailable, use the
installed lower-level connector contract only when it preserves the requested semantics, and report the reduced
coverage. Do not claim independent multi-label coverage when the installed SDK only supports one label.

## Connectors and layout verification

Create and arrange related shapes before creating connectors. Use nodes at least `160 × 80` unless
the content requires more room. For Mermaid-like flowcharts, prefer
`arrangeElementsInLayers(layers, { direction })`; its `140` layer gap and `100` item gap defaults
leave usable terminal and branch corridors. Do not compress gaps merely to reduce screenshot size.

Prefer generated element IDs and element-bound endpoints. For an ordinary relationship, omit
`side`, `routing`, and `routingMode`: facade planning chooses facing sides, persists `straight` for
an aligned unobstructed corridor, and otherwise persists automatic `orthogonal` routing with
`miter` corners. Explicit routing reproduces requested geometry: use `curve` only for a deliberate
self-loop or a short feedback arc with a visibly clear sweep, and `freePolyline` only for requested
manual geometry. Do not use rounded orthogonal corners when a terminal leg or corridor is narrow.

Branch endpoints need deliberate port separation. On one source side, order normalized `position`
values by target geometry, such as `0.25` for the upper branch and `0.75` for the lower branch.
Reuse a position only for an intentional shared port. Keep feedback edges on an outer lane, use
sites facing that lane, and prefer explicit orthogonal miter waypoints when a curve would cross the
main flow.

Use `labelText` when one automatically placed label is sufficient. Use `labels` for UML roles,
multiplicities, ER names, protocol annotations, or any connector that needs several independently editable texts.
Each label needs a stable `id`. Prefer semantic placement over manual offsets:

- `placement.anchor`: `start`, `center`, `end`, or `path`.
- `placement.side`: `left`, `onPath`, or `right`, relative to connector direction from start to end.
- `placement.alongOffset`: distance inward from a start/end anchor.
- `placement.distance`: perpendicular distance from the path.
- `placement.pathRatio`: normalized distance along the complete rendered path when anchor is `path`.
- `placement.orientation`: `horizontal`, `followPath`, or `auto`.

Use `pathRatio` and `offset` only for intentional custom placement or legacy snapshots. The floating connector menu can
select, add, delete, format, and reposition labels by stable ID; dragging one label converts only that label to a
custom `path` anchor. Read labels with `getConnectorLabels()` and update one with `updateConnectorLabel()`.

For diagram grammar, prefer the semantic batch helpers. They still create regular Board connectors, so the result
remains editable and interoperable with `getConnectorConnection()`, label APIs, routing normalization, undo/redo,
resources, and collaboration:

- `insertClassRelations()` maps association, directed association, aggregation, composition, generalization,
  realization, and dependency to markers/dashes. Relation name, endpoint roles, and multiplicities become separate
  path-relative labels.
- `insertEntityRelations()` maps identifying/non-identifying lines and `one`, `zeroOrOne`, `oneOrMany`, or
  `zeroOrMany` endpoint cardinalities to Crow's Foot markers.
- `insertSequenceMessage()` and `insertSequenceMessages()` validate native Board lifelines; the batch API also rejects
  duplicate/non-positive orders, and both persist
  stable message offsets from `firstOffsetY` and `step`. It maps synchronous, asynchronous, reply, create, destroy,
  and self messages to normal connectors.

Shape-site positions are most predictable on rectangles and rounded rectangles. For ellipses,
diamonds, hexagons, and other non-rectangular nodes, start with the side center by omitting
`position`. Add an explicit position only after a rendered screenshot proves the marker clears the
outline. If lint reports marker overlap, first use a smaller marker or more spacing; do not freeze a
poor auto route into manual waypoints merely to silence the finding.

Marker names are a closed API union. Query `BoardConnectorMarkerType` and use values such as
`filledTriangle`, `openArrow`, `filledDiamond`, or `crowFoot`; do not abbreviate them to invented
names such as `diamond`. To render no marker, use `{ type: "none" }` rather than `null`. Keep
`animation: null` only for disabling connector animation, where the Facade explicitly supports it.

Connector `style.dash` is a numeric pattern, such as `[6, 4]`; `[]` is solid. It is not the string `"dash"`,
`"solid"`, or a `strokeDash` property. Query `IBoardConnectorStyle` rather than borrowing another shape's style
contract. Likewise, label `lineBreak` interrupts the line behind text; it does not control text wrapping.

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
if (
  !board.arrangeElementsInLayers([[source.getId()], [target.getId()]], {
    direction: "horizontal",
    start: { x: 80, y: 80 },
  })
)
  throw new Error("Cannot arrange Board shapes");
const connectors = board.insertConnectors([
  {
    fromElementId: source.getId(),
    toElementId: target.getId(),
    style: { endMarker: { type: "filledTriangle", size: "md" } },
  },
]);
if (!connectors) throw new Error("Cannot insert Board connectors");
const analysis = board.analyzeModelLayout(48);
if (!analysis) throw new Error("Cannot analyze Board layout");
return { connectorIds: connectors.map((item) => item.id), analysis };
```

Treat `element-overlap`, `connector-through-element`, `connector-collinear-overlap`, and
`connector-terminal-direction-reversed` as blocking. Treat `connector-crossing` and
`connector-excessive-detour` as warnings that still need local review. A reversed terminal means
the rendered line approaches a bound endpoint against its outward normal; an excessive detour means
an orthogonal route is over three times the direct distance with material extra length. Fix endpoint
sides, spacing, or the outer lane instead of accepting either result. Model analysis deliberately
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

For sequence participants, keep the shape transform at the participant's native/default height.
The dashed lifeline is an extension below that participant; stretching the shape height stretches
the actor/control/entity symbol itself and pushes `{ kind: "lifeline", shapeId, offsetY }` messages
down by the same amount. Keep message offsets within the configured lifeline height and order them
by time.

For containers and swimlanes, `insertShapeAtPoint()` accepts a Board-world point and resolves the
parent and `laneId` at that point. Inspect the returned descriptor to confirm membership. Direct
low-level insertion into a known parent uses parent-local coordinates instead; do not mix those two
coordinate systems.

The insertion point is the shape's top-left corner, not its center. Keep it inside the container's content area,
outside its title and lane headers. Verify both world bounds and membership after insertion; a visually enclosed
shape with no `parentId` is not a container child. If the installed version mishandles drop coordinates, insert at
the root and use `moveElementsToContainer()`, then read back the bounds and lane identity again.

Specify connector intent, marker type/size/offset, and routing mode; do not hand-calculate arrow
depth or terminal-leg length. Render geometry accounts for marker paint bounds, stroke width,
endpoint gap, rounded corners, and dash phase. For orthogonal auto connectors without manual
waypoints or route points, the router reserves marker-aware terminal space without changing the
connector type. Imported or explicitly manual routes keep their topology: rendered lint reports
`connector-marker-target-overlap`, `connector-marker-corner-overlap`, `connector-marker-collision`,
`connector-terminal-direction-reversed`, `connector-excessive-detour`,
`connector-terminal-stem-too-short`, or `connector-terminal-dash-discontinuity` when their visual
configuration does not fit. Treat marker target/corner overlap and marker collision as errors;
review detour, terminal stem, and dash continuity warnings instead of repeatedly normalizing the
route. A stem warning in a very short direct corridor is a spacing problem: enlarge the gap or use a
smaller marker; do not force a folded route into the same corridor.

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

## Connector animation

Connector animation is off by default. When a diagram has a small number of important flows—roughly twelve or fewer
animated connectors—and motion makes direction or activity easier to understand, prefer enabling animation instead
of leaving every relationship visually identical. Keep dense diagrams static: animation is emphasis, not decoration.
BoardSpec may identify a relation as primary, continuous, triggered, or replayed semantic activity, but it must not
select an animation mode or speed. Choose animation during realization and animate only the relations whose motion
adds information.

Use `style.animation.mode` to choose the visual: `dash` moves a dash pattern, `particle` moves one dot, `pulse`
highlights the full path, `gradient` moves a fading highlight, `particles` renders a repeated dot sequence, and
`arrows` renders repeated directional arrowheads. `direction` is `forward` from connector start to end or `reverse`;
it does not depend on marker placement and is ignored by `pulse`. `speed` is a positive multiplier; use `0.5`, `1`,
or `2` for the floating menu's slow, normal, and fast presets. Use `board.setConnectorStyle(id, { animation: null })`
to disable animation; omitting `animation` preserves its current value.

This executable case renders every animation style without overlapping routes:

```js
const modes = ["dash", "particle", "pulse", "gradient", "particles", "arrows"];
const connectors = board.insertConnectors(
  modes.map((mode, index) => ({
    start: { kind: "free", x: 120, y: 100 + index * 80 },
    end: { kind: "free", x: 620, y: 100 + index * 80 },
    routing: "straight",
    style: {
      stroke: index % 2 === 0 ? "#0f766e" : "#b45309",
      strokeWidth: 3,
      endMarker: { type: "filledTriangle", size: "md" },
      animation: {
        mode,
        direction: index % 2 === 0 ? "forward" : "reverse",
        speed: index < 2 ? 0.5 : index < 4 ? 1 : 2,
      },
    },
    labelText: mode,
  })),
);
if (!connectors) throw new Error("Cannot insert animated connectors");
return connectors.map((connector) => ({
  id: connector.id,
  animation: board.getConnectorStyle(connector.id)?.animation,
}));
```

A still screenshot verifies geometry, labels, and persisted styles but cannot prove motion direction or speed. The
CLI renders Board screenshots from a detached in-memory copy with connector animation disabled, so pixel stability
checks do not require editing and restoring the Board. After model and rendered layout checks pass, open the Board
viewer and observe at least one full animation cycle. Confirm that markers remain static, moving effects follow
rounded/curved paths, labels interrupt animated paint cleanly, and reverse arrows point along their actual travel
direction.

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

For mind maps, tables, images, sticky notes, external resources, embeds, and ink intent inside a larger semantic
Board, follow the mixed-content rules in `references/board-spec.md`, query the installed Facade, and apply the same
readback and screenshot completion gate.
