# Selecting native Board content

Use this reference when deciding which structured layout or content element serves the user's intent. These are
agent authoring decisions, not an automatic SDK classifier. Respect an explicit requested presentation; when it
cannot preserve the relationships, explain the conflict instead of silently dropping information.

## Mind map, tree, or timeline

Choose the semantic family before the concrete `structureKind`. Inspect the installed `FBoard.insertMindMap`
contract; the native structure vocabulary below belongs in realization, not BoardSpec.

| User intent and relationship meaning                                        | BoardSpec profile | Native realization candidates               |
| --------------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
| Explore one topic through peer categories and subtopics                     | `mindmap`         | `mindmap-horizontal`, `mindmap-vertical`    |
| Explain ownership, decomposition, or a reporting hierarchy                  | `tree`            | `tree-right`, `tree-left`, `tree-alternate` |
| Explain ordered stages, milestones, or dated events with supporting details | `timeline`        | `timeline-horizontal`, `timeline-vertical`  |

For example, "map Agent capabilities" favors a mind map; "break down the Agent implementation work" favors a tree;
"show Agent capability evolution" favors a timeline. "Show calls between Agent modules" instead favors architecture
or dataflow, even if the modules also have an ownership hierarchy. A chain of calls is not automatically a timeline.

Topology only establishes whether a tree is possible. Use labels, relation `semantic`, `description`, and the user's
purpose to choose the family. If either mind map or tree would work, choose one and briefly explain the choice;
ask only when the ambiguity changes the meaning. Do not add a required layout-preference field to BoardSpec.

Choose horizontal/vertical orientation and branch sides from available Board space, readable label lengths, and
the surrounding content. A wide region can suit a horizontal timeline; a narrow, tall region can suit a vertical
one. Left/right/alternate tree structures are presentation choices, not different ownership semantics. Preserve
existing layout and manually chosen branch sides when editing unless the requested change requires rearrangement.

Represent hierarchical edges with `semantic: "contains"`, from parent to child. These describe topic membership,
not ordinary Board container ownership; do not create containers for every topic. Each native map has one root,
each non-root has one hierarchical parent, and the hierarchy must be connected and acyclic. Multiple parents,
cycles, and cross-links cannot become native tree branches: retain meaningful cross-links separately with supported
bound connectors, or choose a general graph. Do not duplicate an entity or remove a relation without explaining it.

When sibling order matters, use positive `order` values unique within that parent, not globally across the tree.
For timelines, the root's children are ordered stages; their children are stage details. Record whether the order
is conceptual progression or chronological in `description`. Keep supplied dates in content, never invent dates,
and do not imply that equal native timeline spacing measures equal elapsed time.

This conceptual progression has stage-local details; the shared order value `1` under different parents is valid:

```json
{
  "schemaVersion": 1,
  "diagramType": "timeline",
  "title": "Agent capability progression",
  "nodes": [
    {
      "id": "evolution",
      "label": "Agent evolution",
      "semanticRole": "topic",
      "description": "Conceptual progression, not dated history"
    },
    { "id": "tools", "label": "Tool use", "semanticRole": "stage" },
    { "id": "planning", "label": "Planning", "semanticRole": "stage" },
    { "id": "teams", "label": "Multi-agent collaboration", "semanticRole": "stage" },
    { "id": "validation", "label": "Validate tool results", "semanticRole": "capability" },
    { "id": "handoff", "label": "Explicit task handoffs", "semanticRole": "capability" }
  ],
  "relations": [
    { "id": "stage-tools", "from": "evolution", "to": "tools", "semantic": "contains", "order": 1 },
    {
      "id": "stage-planning",
      "from": "evolution",
      "to": "planning",
      "semantic": "contains",
      "order": 2
    },
    { "id": "stage-teams", "from": "evolution", "to": "teams", "semantic": "contains", "order": 3 },
    {
      "id": "tool-validation",
      "from": "tools",
      "to": "validation",
      "semantic": "contains",
      "order": 1
    },
    { "id": "team-handoff", "from": "teams", "to": "handoff", "semantic": "contains", "order": 1 }
  ]
}
```

Translate the hierarchy to the installed native blueprint rather than drawing ordinary rectangles and branches.
Retain semantic-to-generated ID mappings. Verify all nodes, parent/child ownership, sibling order, and full text
after insertion. For large maps, inspect a readable branch as well as the overview; do not hide truncation by
zooming out. Test collapse/expand through the owning native API or UI, preserving descendants and unrelated content.

## Chart, table, or Ink

| Use when                                                                             | Preserve in semantic `content`                                                      | Avoid                                                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Chart: communicate quantitative comparison, trend, distribution, or association      | `kind: "chart"`, analytical purpose, source data, field meanings, units, provenance | Inventing measurements, using a line to imply order in unordered categories, or replacing editable charts with images |
| Table: support exact lookup, comparison across common fields, or UML/ER compartments | `kind: "structured-table"`, columns and rows or named sections and items            | Converting every number into a chart, losing fields, or using a Board table as a spreadsheet calculation engine       |
| Ink: circle a risk, underline evidence, or add a freehand review mark                | `kind: "ink"`, annotation purpose, target via `annotates`                           | Replacing formal UML symbols, bound connectors, or essential text with strokes                                        |

For charts, categorical magnitude comparison suggests bars/columns, ordered numeric series can suggest a line,
and paired numeric observations can suggest a scatter plot. Query supported chart types before choosing one.
Preserve missing values as missing rather than zero, and keep units and aggregation explicit. Without authorized
data, ask for it or use clearly labeled illustrative data only when an example is appropriate; do not invent results
to decorate an architecture diagram. Chart plus table is useful when both overview and exact lookup are requested,
but keep their data consistent instead of generating independent numbers.

Use a native Board table for editable reference data and diagram compartments. If formulas or spreadsheet editing
are essential, inspect native Sheets embed support and report host limitations; a Board table is not an equivalent
fallback. Choose UML/ER table presets only for those semantics, not for every ordinary comparison table.

Ink is supplemental annotation, not a requirement for every diagram. An `annotates` relation identifies the subject;
its realization may be a native Ink circle or underline without an extra connector. Keep required explanations in
editable text, and create stroke geometry only after the target has its final bounds. Recheck clearance when the
target moves. A semantic annotation is not an automatic attachment: inspect grouping/containment support before
promising that strokes follow their subject. Standalone handwriting and small freeform notes may skip BoardSpec.

This mixed example requests exact values, a quantitative comparison, and a targeted review mark. `purpose`,
`columns`, `rows`, `data`, `units`, and `source` are semantic payload conventions here, not Facade parameter names.
The agent translates them through the installed dedicated APIs; no coordinates or chart-type enum are prescribed.

```json
{
  "schemaVersion": 1,
  "diagramType": "architecture",
  "title": "Agent evaluation workbench (illustrative data)",
  "nodes": [
    { "id": "evaluator", "label": "Evaluator", "semanticRole": "service" },
    {
      "id": "results",
      "label": "Exact evaluation results",
      "semanticRole": "evidence",
      "content": {
        "kind": "structured-table",
        "purpose": "Look up exact success rates",
        "columns": ["Strategy", "Success rate (%)"],
        "rows": [
          ["Tool use", 62],
          ["Planning", 78],
          ["Multi-agent", 84]
        ],
        "source": "Illustrative data, not measured benchmark results"
      }
    },
    {
      "id": "comparison",
      "label": "Success rate comparison",
      "semanticRole": "analysis",
      "content": {
        "kind": "chart",
        "purpose": "Compare success rates across strategies",
        "data": [
          ["Strategy", "Success rate (%)"],
          ["Tool use", 62],
          ["Planning", 78],
          ["Multi-agent", 84]
        ],
        "units": { "Success rate (%)": "percent" },
        "source": "Illustrative data, not measured benchmark results"
      }
    },
    {
      "id": "review",
      "label": "Review before drawing conclusions",
      "semanticRole": "annotation",
      "content": { "kind": "ink", "purpose": "Circle the comparison to flag it for review" }
    }
  ],
  "relations": [
    { "id": "produces", "from": "evaluator", "to": "results", "semantic": "produces" },
    { "id": "summarizes", "from": "comparison", "to": "results", "semantic": "summarizes" },
    { "id": "flags", "from": "review", "to": "comparison", "semantic": "annotates" }
  ]
}
```

Read back table cells and chart source values, not just element counts. Verify the annotation's target and native
Ink data, and capture readable content as well as the overview. If an API or provider is unavailable, retain the
intent and report the limitation; a generic rectangle is not evidence that the requested native element works.
