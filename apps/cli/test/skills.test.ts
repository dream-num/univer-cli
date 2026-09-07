import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPLICATION_SKILL_NAMES,
  createApplicationSkillLibrary,
} from "../src/features/skills/library.js";

const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src/skills");

describe("application Skill library", () => {
  it("exposes the current runtime Skill set in stable routing order", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);

    expect(library.names).toEqual(APPLICATION_SKILL_NAMES);
    await expect(library.list()).resolves.toEqual(
      expect.arrayContaining(
        APPLICATION_SKILL_NAMES.map((name) => expect.objectContaining({ hidden: false, name })),
      ),
    );
  });

  it("keeps the discovery Skill addressable but out of runtime list and --all", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const discovery = await library.read({ name: "univer-cli" });

    expect(library.names).not.toContain("univer-cli");
    expect(discovery.metadata).toMatchObject({ hidden: false, name: "univer-cli" });
    expect(discovery.content).toContain("univer skills get core");
  });

  it("delivers the Board label reference through the runtime full-skill reader", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const path = "references/connector-labels.md";
    const content = await readFile(resolve(assetsRoot, "runtime/board", path), "utf8");

    expect(board.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path, content })]),
    );
  });

  it("keeps Board references opt-in and delivers every linked reference", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const entry = await library.read({ name: "board" });
    const full = await library.read({ full: true, name: "board" });

    expect(entry.files).toBeUndefined();
    expect(entry.content).toBe(full.content);
    expect(entry.directory).toBe(full.directory);
    expect(full.files!.length).toBeGreaterThan(0);

    const packaged = new Map(
      [{ path: "SKILL.md", content: entry.content }, ...full.files!].map((file) => [
        resolve(entry.directory, file.path),
        file.content,
      ]),
    );
    const directlyLinked = new Set<string>();
    for (const [path, content] of packaged) {
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
        const target = resolve(dirname(path), match[1]!);
        expect(packaged.has(target), `Missing reference from ${path}: ${match[1]}`).toBe(true);
        await expect(readFile(target, "utf8")).resolves.toBe(packaged.get(target));
        if (path === resolve(entry.directory, "SKILL.md")) directlyLinked.add(target);
      }
    }
    for (const file of full.files!) {
      expect(directlyLinked.has(resolve(entry.directory, file.path)), file.path).toBe(true);
    }
  });

  it("ships a valid use-case example with extension locations owned by the base case", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const reference = board.files?.find((file) => file.path === "references/uml-structure.md");
    expect(reference).toBeDefined();
    const examples = [...reference!.content.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1]!),
    );
    const spec = examples.find((example) => example.diagramType === "uml-use-case");
    expect(spec?.schemaVersion).toBe(1);
    const nodes = new Map<string, { semanticRole: string; extensionPoints?: string[] }>(
      spec.nodes.map((node: { id: string; semanticRole: string; extensionPoints?: string[] }) => [
        node.id,
        node,
      ]),
    );
    expect(nodes.size).toBe(spec.nodes.length);
    expect(
      new Set(spec.relations.map((relation: { semantic: string }) => relation.semantic)),
    ).toEqual(new Set(["include", "extend"]));
    for (const relation of spec.relations) {
      expect(nodes.get(relation.from)?.semanticRole).toBe("use-case");
      expect(nodes.get(relation.to)?.semanticRole).toBe("use-case");
      if (relation.semantic === "extend") {
        expect(relation.condition.trim().length).toBeGreaterThan(0);
        expect(relation.extensionPoints.length).toBeGreaterThan(0);
        for (const point of relation.extensionPoints) {
          expect(nodes.get(relation.to)?.extensionPoints).toContain(point);
        }
      }
    }
  });

  it("ships component assemblies with matching declared contracts and unbound interfaces", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const reference = board.files?.find((file) => file.path === "references/uml-structure.md");
    const examples = [...reference!.content.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1]!),
    );
    const spec = examples.find((example) => example.diagramType === "uml-component");
    expect(spec?.schemaVersion).toBe(1);
    const nodes = new Map<string, { provides?: string[]; requires?: string[] }>(
      spec.nodes.map((node: { id: string; provides?: string[]; requires?: string[] }) => [
        node.id,
        node,
      ]),
    );
    expect(nodes.size).toBe(spec.nodes.length);
    const used = new Set<string>();
    for (const relation of spec.relations) {
      expect(relation.semantic).toBe("assembly");
      expect(nodes.get(relation.from)?.provides).toContain(relation.contract);
      expect(nodes.get(relation.to)?.requires).toContain(relation.contract);
      used.add(relation.contract);
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...nodes.values()].some((node) => node.provides?.some((id) => !used.has(id)))).toBe(
      true,
    );
    expect([...nodes.values()].some((node) => node.requires?.some((id) => !used.has(id)))).toBe(
      true,
    );
  });

  it("delivers a connected timeline example with parent-local stage and detail ordering", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const path = "references/mind-map.md";
    const content = await readFile(resolve(assetsRoot, "runtime/board", path), "utf8");
    expect(board.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path, content })]),
    );
    const examples = [...content.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1]!),
    );
    const spec = examples.find((example) => example.diagramType === "timeline");
    expect(spec?.schemaVersion).toBe(1);
    const nodeIds = new Set<string>(spec.nodes.map((node: { id: string }) => node.id));
    expect(nodeIds.size).toBe(spec.nodes.length);
    const parentByChild = new Map<string, string>();
    const ordersByParent = new Map<string, Set<number>>();
    const relationIds = new Set<string>();
    for (const relation of spec.relations) {
      expect(relation.id.length).toBeGreaterThan(0);
      expect(relationIds.has(relation.id)).toBe(false);
      relationIds.add(relation.id);
      expect(relation.semantic).toBe("contains");
      expect(nodeIds.has(relation.from)).toBe(true);
      expect(nodeIds.has(relation.to)).toBe(true);
      expect(parentByChild.has(relation.to)).toBe(false);
      parentByChild.set(relation.to, relation.from);
      expect(Number.isInteger(relation.order)).toBe(true);
      expect(relation.order).toBeGreaterThan(0);
      const orders = ordersByParent.get(relation.from) ?? new Set<number>();
      expect(orders.has(relation.order)).toBe(false);
      orders.add(relation.order);
      ordersByParent.set(relation.from, orders);
    }
    const roots = [...nodeIds].filter((id) => !parentByChild.has(id));
    expect(roots).toHaveLength(1);
    for (const id of nodeIds) {
      const ancestors = new Set<string>();
      let current = id;
      while (parentByChild.has(current)) {
        expect(ancestors.has(current)).toBe(false);
        ancestors.add(current);
        current = parentByChild.get(current)!;
      }
      expect(current).toBe(roots[0]);
    }
    expect(ordersByParent.get(roots[0]!)?.size).toBe(3);
    expect([...ordersByParent.values()].filter((orders) => orders.has(1))).toHaveLength(3);
  });

  it("ships consistent chart and table data with an Ink annotation targeting the comparison", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const reference = board.files?.find((file) => file.path === "references/content-selection.md");
    const examples = [...reference!.content.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1]!),
    );
    const spec = examples.find((example) => example.diagramType === "architecture");
    expect(spec?.schemaVersion).toBe(1);
    const nodeIds = new Set(spec.nodes.map((node: { id: string }) => node.id));
    expect(nodeIds.size).toBe(spec.nodes.length);
    for (const relation of spec.relations) {
      expect(nodeIds.has(relation.from)).toBe(true);
      expect(nodeIds.has(relation.to)).toBe(true);
    }
    const contentNodes = spec.nodes as Array<{
      id: string;
      content?: {
        kind: string;
        columns?: string[];
        rows?: unknown[][];
        data?: unknown[][];
        source?: string;
        purpose: string;
      };
    }>;
    const table = contentNodes.find((node) => node.content?.kind === "structured-table")!;
    const chart = contentNodes.find((node) => node.content?.kind === "chart")!;
    const ink = contentNodes.find((node) => node.content?.kind === "ink")!;
    expect(chart.content!.data).toEqual([table.content!.columns, ...table.content!.rows!]);
    expect(table.content!.source).toBeTruthy();
    expect(chart.content!.source).toBe(table.content!.source);
    for (const node of [table, chart, ink]) {
      expect(node.content!.purpose.trim().length).toBeGreaterThan(0);
    }
    expect(spec.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: chart.id, to: table.id, semantic: "summarizes" }),
        expect.objectContaining({ from: ink.id, to: chart.id, semantic: "annotates" }),
      ]),
    );
  });

  it("keeps native Chart guidance on the direct host and live Chart contract", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const contracts = [
      {
        insertion: "await board.insertChart(info)",
        name: "board",
        owner: "FBoard.newChart",
        readback: "board.getCharts()",
        stale: ["board.charts", "FBoardCharts", "chart.setData(values).commit()"],
      },
      {
        insertion: "await doc.insertChart(info)",
        name: "doc",
        owner: "FDocument.newChart",
        readback: "doc.getCharts()",
        stale: [
          "doc.charts",
          "FDocumentCharts",
          "univerAPI.Enum.DocChartInsertAnchorKind",
          "chart.setData(values).commit()",
        ],
      },
      {
        insertion: "await slide.insertChart(info)",
        name: "slide",
        owner: "FSlide.newChart",
        readback: "slide.getCharts()",
        stale: ["slide.charts", "FSlideCharts", "FChartBase.commit", "commit()"],
      },
    ] as const;

    for (const contract of contracts) {
      const skill = await library.read({ full: contract.name === "board", name: contract.name });
      const content =
        contract.name === "board"
          ? skill.files!.find((file) => file.path === "references/content-selection.md")!.content
          : skill.content;

      for (const staleApi of contract.stale) expect(content).not.toContain(staleApi);
      expect(content).toContain(contract.owner);
      expect(content).toContain(contract.insertion);
      expect(content).toContain(contract.readback);
      expect(content).toContain("chart.setDataSource(values)");
      expect(content).toContain("await chart.remove()");
    }
  });

  it("keeps Base inspection guidance aligned with its object model", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const base = await library.read({ full: true, name: "base" });
    expect(base.content).toContain("FBaseTableField");
    expect(base.content).toContain("FBaseTableRecord");
    expect(base.content).toContain("FBaseTableView");
    expect(base.content).toContain("FEnum.BaseFieldType");
    expect(base.content).toContain("FBaseTable.addField");
    expect(base.content).toContain("there is no `addFields` method");
    expect(base.content).toContain("ICardLayoutConfig");
    expect(base.content).toContain("univer inspect base");
    expect(base.content).toContain("It is read-only and accepts no selector");
    expect(base.content).toContain("explicitly `return` record values");
    expect(base.content).toContain(
      "`execute` predefines `univerAPI`, `api`, and the `FBase` named `base`",
    );
    expect(base.content).not.toContain("const base =");
    expect(base.content).not.toContain("api find base table field record view");
    expect(base.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("table.getFormulaName()"),
          path: "references/formulas.md",
        }),
      ]),
    );
  });

  it("keeps the current Skill corpus aligned with the CLI contract", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const snapshots = await Promise.all(
      [...APPLICATION_SKILL_NAMES, "univer-cli"].map(
        async (name) => await library.read({ full: true, name }),
      ),
    );
    const corpus = snapshots.map((snapshot) => snapshot.content).join("\n");
    const core = snapshots.find((snapshot) => snapshot.metadata.name === "core");
    const skillReadme = await readFile(resolve(assetsRoot, "README.md"), "utf8");

    expect(corpus).toContain("univer update");
    expect(corpus).toContain("A `ready` worktree rejects writes until it is explicitly reopened");
    expect(corpus).toContain("univer lint --file");
    expect(corpus).toContain("with the Lite Interface");
    expect(corpus).toContain("Use when a task involves reading or editing .univer");
    expect(corpus).toContain("always select exactly one scope with `--trunk` or `--worktree <id>`");
    expect(core?.content).toContain("Queries are not combined as AND");
    expect(core?.content).toContain("`find` does not interpret intent");
    expect(core?.content).toContain("`show` accepts one or more exact symbols");
    expect(core?.content).toContain("Do not pass `--unit` to `show`");
    expect(corpus).not.toContain("search by intent");
    expect(skillReadme).toContain("`src/skills` 是 source of truth");
  });
});
