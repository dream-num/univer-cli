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
