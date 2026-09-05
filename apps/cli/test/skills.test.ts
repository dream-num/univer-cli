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

  it("ships a valid use-case example with extension locations owned by the base case", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const board = await library.read({ full: true, name: "board" });
    const reference = board.files?.find((file) => file.path === "references/board-spec.md");
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
    const reference = board.files?.find((file) => file.path === "references/board-spec.md");
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
      const skill = await library.read({ name: contract.name });

      for (const staleApi of contract.stale) expect(skill.content).not.toContain(staleApi);
      expect(skill.content).toContain(contract.owner);
      expect(skill.content).toContain(contract.insertion);
      expect(skill.content).toContain(contract.readback);
      expect(skill.content).toContain("chart.setDataSource(values)");
      expect(skill.content).toContain("await chart.remove()");
    }
  });

  it("keeps Base and Board inspection guidance aligned with their object models", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const base = await library.read({ full: true, name: "base" });
    const board = await library.read({ full: true, name: "board" });

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

    expect(board.content).toContain("univer inspect board");
    expect(board.content).toContain("inspect board-element id:<element-id>");
    expect(board.content).toContain("Both commands are read-only");
    expect(board.content).toContain("## Completion gate");
    expect(board.content).toContain("outputs[0].layoutAnalysis");
    expect(board.content).toContain("normalize only those connector IDs at most once");
    expect(board.content).toContain("fromElementId: source.getId()");
    expect(board.content).toContain("toElementId: target.getId()");
    expect(board.content).toContain("Use `labels` for UML roles");
    expect(board.content).toContain("insertClassRelations()");
    expect(board.content).toContain("insertEntityRelations()");
    expect(board.content).toContain("insertSequenceMessages()");
    expect(board.content).toContain("placement.anchor");
    expect(board.content).toContain("For ellipses,");
    expect(board.content).toContain("detached in-memory copy with connector animation disabled");
    expect(board.content).toContain("first write a semantic BoardSpec in JSON");
    expect(board.content).toContain("BoardSpec may identify a relation as primary");
    expect(board.content).toContain("FBoard.insertMindMap");
    expect(board.content).toContain("Marker names are a closed API union");
    expect(board.content).toContain("insertShapeAtPoint()");
    expect(board.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('"semanticRole": "message-bus"'),
          path: "references/board-spec.md",
        }),
        expect.objectContaining({
          content: expect.stringContaining('"messageType": "reply"'),
          path: "references/board-spec.md",
        }),
        expect.objectContaining({
          content: expect.stringContaining('"multiplicity": "0..*"'),
          path: "references/board-spec.md",
        }),
      ]),
    );
    expect(board.content).not.toContain("start: { elementId: source.getId() }");
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
