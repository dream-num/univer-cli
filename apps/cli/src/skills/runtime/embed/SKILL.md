---
name: embed
description: "Use when assembling a report, dashboard, presentation, database, or canvas that should include content from another Univer Unit."
---

# Embed Units

Embed is a shared capability across Univer Unit types. Load this Skill with `core` plus the host and
child Unit Skills. Keep both Units in the same `.univer` target and address each by `unitId`.

The Viewer supports one Embed level only. A host may contain multiple sibling Embeds, but do not
embed a Unit that itself contains an Embed. Keep the Units as siblings or link them instead of
persisting a nested Embed graph that the Viewer will reject.

Use the host Unit type to choose its surface and context, and use the child Unit type to build its
ResourceRef. Resolve the exact names from the version-matched Facade index:

```bash
univer api show FUniver.createEmbed FEmbed FEmbedHostSurface ICreateEmbedParams IEmbedDescriptor
univer api find embed host surface
```

Create the child Unit with its Unit Skill, then use its exact `unitId` and Unit type in the
ResourceRef. The example below embeds a Doc as a Sheet tab; for another child type, change both
`unitType` and the ResourceRef `type` to the same actual type.

For a `SheetFloating` host, `context` must include an explicit drawing `placement`. For absolute
canvas bounds, use `{ kind: univerAPI.Enum.SheetDrawingAnchorType.None, bounds: { left, top, width,
height } }`.

```bash
univer execute <file.univer> --worktree <id> --unit <host-unit-id> -e '
const hostUnitId = "<host-unit-id>";
const childUnitId = "<child-unit-id>";
const sourceRef = "#unit=" + childUnitId + "&type=doc";
const embed = univerAPI.createEmbed({
  embedId: "<embed-id>",
  host: {
    unitId: hostUnitId,
    surface: univerAPI.Enum.FEmbedHostSurface.SheetTab,
  },
  content: {
    unitType: univerAPI.Enum.UniverInstanceType.UNIVER_DOC,
    ref: sourceRef,
  },
  interaction: "interactive",
});
const child = await embed.loadAsync();
if (!child || child.getId() !== childUnitId) throw new Error("Embedded child mismatch");
const descriptor = embed.getDescriptor();
if (descriptor.source?.ref !== sourceRef) throw new Error("Embedded ResourceRef mismatch");
return { childUnitId: child.getId(), descriptor };'
```

Verify the returned child facade, descriptor, and the host Unit's stored anchor. Finish with
`univer open <file.univer> --worktree <id> --unit <host-unit-id>` and review the rendered child
inside its host.

## Referencing another Unit's data from a Chart

When a Chart on a Slide, Doc, or Board should reflect a range in a different Unit, bind it as a
ResourceRef instead of pasting the values. Values are a snapshot: a source edit will not change the
Chart. A ResourceRef keeps the Chart live.

The source and host Units live in the same `.univer` target; each is addressed by `unitId`. Resolve
the exact source object with `univer api show IResourceRefChartDataSourceInput`, then pass it straight
to the host Chart's `setSource` — it accepts the ref contents (`{ file?, unit, part }`) directly.
Wrapping it as `{ source: { kind, ref } }` fails normalization with `RESOURCE_REF_INVALID_UNIT`.

Verify the stored source is a reference (its `dataSource.source.kind` is `resource-ref`), and confirm
the Chart reads the referenced range in a fresh read back. A cross-Unit reference resolves only when
the source Unit is loaded in the same runtime as the host — in the Viewer both are open together (for
example both embedded in a Board). A single-Unit `execute` or `screenshot` loads only the host, so a
cross-Unit Chart can render a placeholder there; review it in the Viewer.

Live refresh works when the runtime registers a referenced-source data provider (`watchData`) that
watches the source range. The `collab-web` Viewer registers one for Sheet ranges; a runtime without it
never updates the Chart on a source edit, and headless `execute`/`screenshot` never drive this
refresh.
