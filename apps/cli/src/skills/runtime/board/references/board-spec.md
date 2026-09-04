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

For UML sequence diagrams, realize participants first and align their headers at the same top coordinate. Then call
`insertSequenceMessages()` once for the ordered messages. Add activation bars with
`BoardSequenceShapeType.ActivationBar` and bind their sequence activation data to a lifeline. Use the dedicated
sequence-fragment Board table preset for `alt`, `opt`, `loop`, `par`, `break`, `critical`, and `ref` frames; its
guard/operand rows are structured content, not connector labels. Never simulate lifelines with generic dashed
connectors—the semantic helper intentionally rejects them.

When fragments or activations matter, include their semantic scope in the spec rather than guessing it during
layout. An optional `fragments` list can contain `{ id, operator, operands: [{ guard, messageIds }] }`; use stable
relation IDs and explicit nested fragment IDs if nesting is needed. An optional `activations` list can contain
`{ participantId, startsAtMessageId, endsAtMessageId }`. Validate those references and message ordering. These
authoring fields express control flow and duration without storing frame bounds or activation geometry.

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
- `chart`: keep the data and analytical intent; realize with native `FBoard.newChart()` / `insertChart()`.
- `image`: retain the asset reference and its purpose, then use `insertImage()`.
- `sticky`: use for an intentionally informal note. A cluster of unrelated sticky notes does not need BoardSpec.
- `external-resource` or `embed`: retain the authorized source reference and relationship semantics. Let the host
  capability determine whether it becomes an embed, image, link card, or other editable element.
- `ink`: describe the annotation intent, not points or paths. Generate or edit strokes only during realization. For
  existing user ink, refer to its element ID instead of copying stroke geometry into the spec.

BoardSpec can mention every Board element as semantic content, but it is not mandatory for every element and does
not make every element relational. A chart's source data, an image's asset reference, a sticky note's text, an
embed's authorized URL, and ink stroke geometry remain payloads consumed by their dedicated APIs. Put them in
`content` only when they participate in a larger diagram; otherwise call the direct Facade API without BoardSpec.
For an embed, retain its host/type and source reference but never copy opaque embed runtime state into the spec.

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
