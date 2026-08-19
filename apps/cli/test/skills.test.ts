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

  it("keeps the current Skill corpus aligned with the CLI contract", async () => {
    const library = createApplicationSkillLibrary(assetsRoot);
    const snapshots = await Promise.all(
      [...APPLICATION_SKILL_NAMES, "univer-cli"].map(
        async (name) => await library.read({ full: true, name }),
      ),
    );
    const corpus = snapshots.map((snapshot) => snapshot.content).join("\n");
    const skillReadme = await readFile(resolve(assetsRoot, "README.md"), "utf8");

    expect(corpus).toContain("univer update");
    expect(corpus).toContain("A `ready` worktree rejects writes until it is explicitly reopened");
    expect(corpus).toContain("univer lint --file");
    expect(corpus).toContain("with the Lite Interface");
    expect(corpus).toContain("Use when a task involves reading or editing .univer");
    expect(corpus).toContain("always select exactly one scope with `--trunk` or `--worktree <id>`");
    expect(skillReadme).toContain("`src/skills` 是 source of truth");
  });
});
