# Semantic BoardSpec

Use BoardSpec as a compact JSON planning artifact when relationships or diagram grammar matter. The agent writes the
spec from the user's intent, checks its structure, and then chooses existing Board Facade APIs, layout, and styling.
BoardSpec is not an SDK input, a second Board model, or a reason to replace direct Facade calls.

## Contract

```json
{
  "schemaVersion": 1,
  "diagramType": "dataflow",
  "title": "Order event topology",
  "nodes": [
    {
      "id": "checkout",
      "label": "Checkout API",
      "semanticRole": "service"
    },
    {
      "id": "orders",
      "label": "orders.v1",
      "semanticRole": "message-bus",
      "description": "Order events, partitioned by order_id"
    }
  ],
  "relations": [
    {
      "id": "publish-orders",
      "from": "checkout",
      "to": "orders",
      "semantic": "publish-event",
      "label": "OrderPlaced",
      "activity": "continuous",
      "importance": "primary"
    }
  ],
  "groups": [
    {
      "id": "order-system",
      "label": "Order system",
      "groupType": "system-boundary",
      "contains": ["orders"]
    }
  ]
}
```

Required fields are `schemaVersion`, `diagramType`, `nodes`, and `relations`. IDs are stable semantic handles. Use
`semanticRole` to explain what a node does; do not call this field `role`, because Board elements already reserve
`role` for runtime-owned behavior. Roles are descriptive vocabulary rather than a closed product enum: prefer clear
domain nouns such as `actor`, `service`, `decision`, `message-bus`, `database`, `uml-class`, `state`, or `annotation`.

Relations describe meaning with `semantic`, for example `request`, `response`, `publish-event`, `consume-event`,
`dependency`, `association`, `inheritance`, `transition`, or `contains`. `order` is required when sequence matters.
`activity` and `importance` are semantic hints; they do not prescribe connector paint.

Relation endpoint semantics belong in `ends`, not in the node's `semanticRole`. This preserves roles and cardinality
without leaking connector coordinates or label placement into the spec:

```json
{
  "id": "order-lines",
  "from": "order",
  "to": "line",
  "semantic": "composition",
  "label": "contains",
  "ends": {
    "from": { "role": "whole", "multiplicity": "1" },
    "to": { "role": "parts", "multiplicity": "0..*" }
  }
}
```

For ERD, use `cardinality` on each end with the normalized values `one`, `zeroOrOne`, `oneOrMany`, or `zeroOrMany`.
For sequence messages, use `messageType` with `synchronous`, `asynchronous`, `reply`, `create`, `destroy`, or `self`.
These values map directly to the Facade semantic helpers; they do not choose paint or geometry.

Groups express nesting. `groupType` may be `container`, `system-boundary`, `uml-package`, or `swimlane`. A group can
appear in another group's `contains` list. A swimlane group also declares semantic lanes:

```json
{
  "id": "fulfillment",
  "groupType": "swimlane",
  "label": "Fulfillment",
  "lanes": [
    { "id": "sales", "label": "Sales", "contains": ["approve-order"] },
    { "id": "warehouse", "label": "Warehouse", "contains": ["pack-order"] }
  ]
}
```

Do not store coordinates, dimensions, colors, fonts, concrete `shapeType` values, connector sites, waypoints,
routing modes, markers, animation modes, or animation speeds in BoardSpec. Existing Board content and the renderer
may require a different layout on every realization.

## Diagram profiles

Choose the closest profile and query its installed APIs before writing the realization script:

| `diagramType`                            | Preferred Board primitives                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `flowchart`, `uml-activity`              | `ShapeTypeEnum.Flowchart*`, layered layout, connectors; use `createSwimlane()` when responsibility is explicit            |
| `dataflow`, `architecture`, `deployment` | custom storage/component shapes, `createContainer()`, layered layout, automatic orthogonal connectors                     |
| `uml-sequence`                           | `BoardSequenceShapeType` lifelines/activation bars, lifeline endpoints, ordered messages, sequence-fragment table presets |
| `uml-class`                              | `insertTable()` with `BoardTableDiagramPreset.UMLClass`; use UML markers for inheritance, composition, and aggregation    |
| `erd`                                    | `insertTable()` with an ERD preset and crow-foot/cardinality markers                                                      |
| `uml-use-case`                           | actor custom shapes, ellipses, and a system-boundary container                                                            |
| `uml-state`                              | initial/final/state-bar custom shapes and transition connectors                                                           |
| `uml-component`, `uml-package`           | component/interface custom shapes and package containers                                                                  |
| `mindmap`, `tree`, `timeline`            | `insertMindMap()` with the matching structured layout                                                                     |

The profile narrows the API search; it does not force every node into one primitive. A deployment diagram can mix
containers, components, images, tables, and connectors when that better expresses the intent.

For activity control flow, distinguish `fork` / `join` from `decision` / `merge` in `semanticRole`.
A fork starts concurrent branches; the ordinary join waits for all incoming branches. A merge accepts alternative
paths without synchronization. Use a merge for initial entry plus a retry path, not a join that waits for both.
Keep decision conditions on outgoing relations as semantic `condition` text and render them as `[guard]` labels.
These distinctions follow [OMG UML activity control nodes](https://www.omg.org/spec/UML/ISO/19505-2/PDF).

Realize fork/join with native `BoardCustomShapeType.StateBar`, not sequence activation bars or a free thick line.
Use the native initial/final symbols, diamonds for decision/merge, and action shapes for work. An unlabeled merge
diamond is intentional. Bind each control-flow endpoint to its node; distribute independent branch ports along
the bar and verify both incoming and outgoing arrows visually. A cross-lane bar can belong to the swimlane pool's
`contains` without belonging to any individual lane; actions belong in the responsible lane's `contains` instead.
Read back `parentId` and `laneId`: visual enclosure does not establish ownership. Route retries around the main
flow, then verify moving a branch action preserves its lane, both bindings, and single-step Undo/Redo.
This is diagram authoring, not an execution engine or proof of deadlock freedom.

For use-case diagrams, distinguish behavioral reuse from temporal flow. `include` points from the including use
case to the included use case; `extend` points from the extending use case to the base use case. Both realize as
dashed connectors with an `openArrow` at the target and a separate `«include»` or `«extend»` label. Generalization
points from the specialized actor/use case to the general one, using a solid line and target `openTriangle`.
Actor associations normally have neither arrowhead nor stereotype. Do not use flow arrows or animation to imply
execution order. These meanings follow [OMG UML use-case semantics](https://www.omg.org/spec/UML/2.5.1).

When extension locations matter, declare `extensionPoints` on the base use-case node and reference those names in
the extending relation's `extensionPoints` list. Keep its optional `condition` as semantic text. Every referenced
point must belong to the relation's `to` node, not its `from` node. Preserve the condition and locations in readable
annotation content; for strict UML notation, use a note attached to the extend relationship. If that attachment is
unavailable, report the notation limitation instead of silently discarding the condition. Keep actors outside the
system container and read back real membership for the enclosed use cases. Check non-central ellipse attachments
visually; a rectangle's normalized port placement can intersect an ellipse's outline.

For UML sequence diagrams, realize participants first. Query `IBoardFacadeInsertSequenceMessagesOptions`: when
`timeOriginY` is supported, choose one Board-world origin and reuse it across batches, including single-message
calls. Message time is `timeOriginY + firstOffsetY + (order - 1) * step`, not an independent offset from each header.
Without that option, align existing participants' header bottoms or derive each endpoint's lifeline offset from
the same world time with the installed lower-level connector API. Do not align a late-created participant with
participants that already exist at the beginning.

Create activation bars with `BoardSequenceShapeType.ActivationBar` and bind their sequence
activation data to a lifeline, then create the ordered messages. An endpoint within an execution span must bind to
the activation bar's facing edge, not the lifeline center. Query the installed `insertSequenceMessages()` contract:
versions supporting activation selection use the unique covering bar; overlapping executions require explicit
`fromActivationId` / `toActivationId`. Earlier versions need `insertConnector()` or `setConnectorConnection()` with
`{ elementId: activationId, side: "left" | "right", position }`. Compute `position` from message world Y and the
activation's world bounds; it runs top-to-bottom on either vertical side. Outside execution spans use
`{ kind: "lifeline", shapeId: participantId, offsetY }`. Never replace this binding with a free point or pixel offset.
The generated binding is fixed: later adding/removing an execution or changing its semantic span requires reviewing
affected messages; resizing a bar preserves normalized attachment positions, not absolute message times.
Use native sequence-fragment Board tables, with guard/operand rows as structured content rather than connector
labels. Query `BoardTableDiagramPreset`: prefer `UMLSequenceAlternativeFragment` for multi-operand `alt`/`par` and
`UMLSequenceFragment` for single-operand `opt`, `loop`, `break`, `critical`, and `ref`. Set the operator cell explicitly;
a preset's placeholder title is not the requested operator. Never simulate lifelines with generic dashed
connectors—the semantic helper intentionally rejects them.

For self calls, send and receive times must differ: inspect `selfMessageHeight` and `selfMessageWidth` support before
using the helper. A same-participant synchronous call also needs a return leg; a zero-length line is not a self call.
Keep the receive time inside its intended activation/lifetime and leave room before the next message. For `create`,
position the new participant header at the receive time and bind to its facing header edge; do not bind to a
lifeline below the header. For `destroy`, end the receiving lifeline at the receive time and verify the cross there.
The insertion helper does not reposition participants or truncate their lifelines. Prepare those native elements
first, inspect the installed lifecycle validation, and verify endpoint readback and export rather than assuming
that a supported message-type string implements all of its semantics.

When fragments or activations matter, include their semantic scope in the spec rather than guessing it during
layout. An optional `fragments` list can contain `{ id, operator, operands: [{ guard, messageIds }] }`; use stable
relation IDs and explicit nested fragment IDs if nesting is needed. An optional `activations` list can contain
`{ participantId, startsAtMessageId, endsAtMessageId }`. Validate those references and message ordering. These
authoring fields express control flow and duration without storing frame bounds or activation geometry.
When executions overlap, give each activation a semantic `id` and reference it with `ends.from.activationId` or
`ends.to.activationId` on the message. Translate those semantic IDs to generated bar IDs during realization.

For `par`, preserve message order within each operand, not a strict order across operands. The horizontal dashed
divider separates parallel operands; their vertical stacking does not mean one finishes before the other starts.
Do not add an `else` guard to mean a second parallel branch. These are
[UML parallel-fragment semantics](https://www.omg.org/spec/UML/ISO/19505-2/PDF), not an execution scheduler.
Realization may use separate message batches with operand-local `order` and explicit offsets while retaining one
Board-world origin. Those offsets position the drawing; they do not create cross-operand precedence in BoardSpec.
Keep aggregation after the fragment when it requires both results. A native fragment table is a visual scope,
not a container that owns its messages: moving/resizing it does not reschedule messages or their activation spans.
Review operand boundaries and label clearance after frame edits, and preserve all unrelated bindings and content.

For UML classes and ER entities, create the compartment tables first. Use `insertClassRelations()` or
`insertEntityRelations()` once the generated element IDs are known. Endpoint roles, multiplicities, relation names,
and ER cardinalities are connector semantics and must remain separate fields in BoardSpec even though realization
turns visible text into multiple connector labels.

A table preset owns its initial dimensions and may override requested `rows`, `columns`, `width`, or `height`.
After insertion, call `getStructure()`, grow with `insertRows()` / `insertColumns()` if necessary, and size with
`resizeRows()` / `resizeColumns()` before `setValues()`. Read back both `getStructure()` and `getValues()`; a
successful insertion can still contain placeholder fields or too few rows. Style header and body text separately
when a preset's defaults are insufficient for the requested language or screenshot scale.
Also read the Board element's transform: table-resource row/column sizes and the host's visible bounds can differ.
For a sequence frame, verify its actual bounds enclose every operand's messages and all participating lifelines;
adjust the host with `setElementTransform()` when necessary, then recapture instead of assuming table resize did it.
Leave a left gutter for the frame's title notch and top-aligned operand guards, clear of lifelines and activation
bars. Place operand dividers and the bottom border between rendered message label bounds, not merely between
connector Y positions; a following message's label can extend upward into the frame. If a guard needs a shorter
visible form, preserve its full condition in the spec and keep the abbreviation unambiguous.

## Structured and mixed content

A node may include a semantic `content` payload when its information cannot be represented by only a label:

```json
{
  "id": "order-class",
  "label": "Order",
  "semanticRole": "uml-class",
  "content": {
    "kind": "structured-table",
    "sections": [
      { "label": "Attributes", "items": ["id: UUID", "status: OrderStatus"] },
      { "label": "Operations", "items": ["submit(): void"] }
    ]
  }
}
```

Supported semantic content kinds are open-ended, but use these established decisions:

- `structured-table`: realize as a Board table, including UML/ERD presets where applicable.
- `chart`: keep the data and analytical intent; realize with native `FBoard.newChart()` / `insertChart()`. Bind
  relations to `chart.getElementId()`, not its chart resource `getId()`. Check axis bounds and units visually;
  use a zero baseline for magnitude comparisons with bars, and label illustrative data as such.
- `image`: retain the asset reference and its purpose, then use `insertImage()`.
- `sticky`: use for an intentionally informal note. A cluster of unrelated sticky notes does not need BoardSpec.
- `external-resource`: retain the authorized source reference and relationship semantics; query the installed host
  and provider capabilities before choosing a link card, preview, or native embed.
- `embed`: use a native interactive child when editing is part of the intent. Query `FUniver.createEmbed`,
  `FEmbed.loadAsync`, and `FEmbedHostSurface.BoardFloating`; do not silently substitute an image or link card.
- `ink`: describe the annotation intent, not points or paths. Generate or edit strokes only during realization. For
  existing user ink, refer to its element ID instead of copying stroke geometry into the spec.

Not every semantic relation needs a connector. An `annotates` relation can become an Ink underline or nearby note;
verify that the intended subject is unambiguous without drawing an extra arrow. Preserve native editable Ink data,
not just a visually equivalent image or generic line. Semantic annotation does not itself create an editing
constraint: use supported grouping or containment when the note and its annotation should move together.

BoardSpec can mention every Board element as semantic content, but it is not mandatory for every element and does
not make every element relational. A chart's source data, an image's asset reference, a sticky note's text, an
embed's authorized URL, and ink stroke geometry remain payloads consumed by their dedicated APIs. Put them in
`content` only when they participate in a larger diagram; otherwise call the direct Facade API without BoardSpec.
For an embed, retain its host/type and source reference but never copy opaque embed runtime state into the spec.

Native Board embeds are created through `api.createEmbed()`, not `board.insertShape()`. Supply the Board host unit,
`BoardFloating` surface, authorized source reference and child unit type; choose bounds during realization, not in
BoardSpec. Creation establishes the descriptor and host anchor, but does not prove the child can load. Await
`embed.loadAsync()` and verify the returned child, visible content and intended interaction. Report unavailable
plugins, unsupported sources, loading failures or access restrictions rather than claiming an empty anchor is a
working embed. Do not fetch unrelated content or broaden authorization to make a source load.

Use `embed.getHostAnchorId()` for Board connector endpoints and element inspection. `embed.getId()` identifies the
embed descriptor and `getChildUnitId()` identifies the child document; neither is the Board element ID. Keep these
IDs distinct in readback. Inspect `getDisplayTarget()` separately from the child's current selection/navigation;
local child navigation is not proof that the persisted display target changed.

The current native `BoardFloating` host is root-only: it does not support container/lane membership, rotation or
flips. If the spec requires such membership, report the unsupported mapping and resolve the requested structure;
visual enclosure is not a substitute for `parentId` / `laneId`. Query the installed contract before relying on a
newer capability. For editable embeds, verify child edits do not alter host relationships, and check host
move/resize and delete/undo preserve connector bindings, labels and element order.

JSON is the canonical exchange form because agents can emit and validate it deterministically. YAML may be accepted
as a human-authored input and Markdown may wrap fenced JSON, but normalize either to the same in-memory object before
checking IDs and relations. Do not maintain parallel JSON/YAML/Markdown schemas. Compact JSON usually costs fewer
tokens than pretty-printed JSON, but do not claim a universal token advantage over YAML; compare equivalent content
when token cost matters.

## Structural checks

Before calling Facade APIs, check the spec in memory or with a short script:

1. `schemaVersion` is `1`; every node and group ID is non-empty and unique.
2. Every relation endpoint and every `contains` member exists.
3. A member belongs to at most one direct container or swimlane lane.
4. Group containment has no cycle, and every lane ID is unique inside its swimlane.
5. Ordered profiles such as `uml-sequence` have unique positive relation orders.
6. Required structured content exists for UML classes, ERD entities, and charts.
7. Class/ER relation ends use valid roles, multiplicities, and cardinalities; sequence `messageType` values are
   supported and every message order fits within the intended participant lifelines.
8. Use-case `include`/`extend` endpoints are use cases; referenced extension points exist on the base (`to`) use case.
   Generalization connects like kinds (actor to actor or use case to use case), with no inheritance cycle.

Return diagnostics and repair the spec before mutation when a check fails. Do not validate coordinates, routing, or
paint here; Board model analysis and rendered screenshot analysis own those checks after realization. Do not add a
general parser or compiler merely to perform these structural checks.

## Realization and animation

Resolve each semantic role to the closest native primitive, retain the returned element IDs, arrange nodes and
groups, and create connectors last. Prefer automatic routing so the persisted connectors stay editable when users
move elements. Use explicit ports or waypoints only when the diagram grammar or screenshot evidence requires them.
Keep sequence participant transforms at native height; the dashed lifeline is a separate extension, and message
`offsetY` values must remain within its configured length. Marker types are a closed API union: use names such as
`filledDiamond` or `openDiamond`, not `diamond`, and use `{ "type": "none" }` rather than `null` when a connector
should have no marker.

Animation is a realization choice. Consider it when a relation's semantics indicate a primary active flow,
continuous stream, trigger, replay, or direction that motion clarifies. Animate at most about twelve important
connectors, keep structural UML/ERD relationships static, and keep dense diagrams static. Choose `dash`, `particle`,
`pulse`, `gradient`, `particles`, or `arrows` and an appropriate speed only after layout is known. Finish with model
readback, rendered layout analysis, a still screenshot, and—when animation is enabled—one observed viewer cycle.

## Compact examples

Use-case reuse and conditional extension remain semantic, without coordinates or marker configuration:

```json
{
  "schemaVersion": 1,
  "diagramType": "uml-use-case",
  "nodes": [
    {
      "id": "run",
      "label": "Execute task",
      "semanticRole": "use-case",
      "extensionPoints": ["high-risk-call"]
    },
    { "id": "validate", "label": "Validate constraints", "semanticRole": "use-case" },
    { "id": "approve", "label": "Human approval", "semanticRole": "use-case" }
  ],
  "relations": [
    { "from": "run", "to": "validate", "semantic": "include" },
    {
      "from": "approve",
      "to": "run",
      "semantic": "extend",
      "condition": "Tool call is high risk",
      "extensionPoints": ["high-risk-call"]
    }
  ]
}
```

Sequence messages use semantic order rather than coordinates:

```json
{
  "schemaVersion": 1,
  "diagramType": "uml-sequence",
  "nodes": [
    { "id": "user", "label": "User", "semanticRole": "actor" },
    { "id": "api", "label": "Order API", "semanticRole": "service" },
    { "id": "db", "label": "Orders", "semanticRole": "database" }
  ],
  "relations": [
    {
      "from": "user",
      "to": "api",
      "semantic": "message",
      "messageType": "synchronous",
      "label": "submit()",
      "order": 1
    },
    {
      "from": "api",
      "to": "db",
      "semantic": "message",
      "messageType": "synchronous",
      "label": "insert",
      "order": 2
    },
    {
      "from": "api",
      "to": "user",
      "semantic": "message",
      "messageType": "reply",
      "label": "accepted",
      "order": 3
    }
  ],
  "groups": []
}
```

A UML class profile carries editable compartments but no table dimensions:

```json
{
  "schemaVersion": 1,
  "diagramType": "uml-class",
  "nodes": [
    {
      "id": "order",
      "label": "Order",
      "semanticRole": "uml-class",
      "content": {
        "kind": "structured-table",
        "sections": [{ "label": "Attributes", "items": ["id: UUID"] }]
      }
    },
    {
      "id": "line",
      "label": "OrderLine",
      "semanticRole": "uml-class",
      "content": {
        "kind": "structured-table",
        "sections": [{ "label": "Attributes", "items": ["quantity: number"] }]
      }
    }
  ],
  "relations": [
    {
      "id": "order-lines",
      "from": "order",
      "to": "line",
      "semantic": "composition",
      "label": "contains",
      "ends": {
        "from": { "role": "whole", "multiplicity": "1" },
        "to": { "role": "parts", "multiplicity": "1..*" }
      }
    }
  ],
  "groups": []
}
```
