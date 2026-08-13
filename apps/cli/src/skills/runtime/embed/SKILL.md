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
