import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { GATEWAY_DESCRIPTOR_MEDIA_TYPE } from "@univer/collab-gateway-contract";
import { describe, expect, it } from "vitest";
import { createV1ActiveWorktreeFixture, createV1Fixture } from "./univerfile-fixture.js";

const execFileAsync = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = join(projectRoot, "dist", "bin.js");

describe("built univer executable", () => {
  it("runs the real packaged entrypoint", async () => {
    const { stdout } = await invoke(["--help"]);

    expect(stdout).toContain("Usage: univer");
    expect(stdout).toContain("api");
    expect(stdout).not.toContain("sac");

    const inspectionHelp = (await invoke(["inspect", "--help"])).stdout;
    const targets = [
      "workbook",
      "worksheet",
      "range",
      "document",
      "paragraph",
      "presentation",
      "slide",
      "base",
      "board",
      "board-element",
    ];
    for (let index = 1; index < targets.length; index += 1) {
      expect(inspectionHelp.indexOf(`"${targets[index - 1]}"`)).toBeLessThan(
        inspectionHelp.indexOf(`"${targets[index]}"`),
      );
    }
  });

  it("compiles a minimal Typst bundle from the packaged entrypoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-cli-built-typst-"));
    const pages = join(root, "pages");
    const output = join(root, "document.js");
    const diagnostics = join(root, "diagnostics.json");
    try {
      await mkdir(pages);
      await writeFile(join(pages, "one.typ"), "= Hello\n\nWorld", "utf8");
      await writeFile(
        join(root, "typst.json"),
        JSON.stringify({
          schemaVersion: 1,
          targetUnitId: "doc-built",
          title: "Built Typst",
          pages: ["pages/one.typ"],
        }),
        "utf8",
      );

      const compiled = parseJson(
        (
          await invoke([
            "compile-typst",
            root,
            "--out",
            output,
            "--diagnostics-out",
            diagnostics,
            "--json",
          ])
        ).stdout,
      ) as Record<string, unknown>;

      expect(compiled).toMatchObject({
        diagnostics: [],
        javascriptPath: output,
        targetUnitId: "doc-built",
        title: "Built Typst",
      });
      expect(await readFile(output, "utf8")).toContain("docMigration.apply");
      expect(JSON.parse(await readFile(diagnostics, "utf8"))).toEqual({
        schemaVersion: 1,
        diagnostics: [],
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("ships and reads version-matched Skill assets from the built entrypoint", async () => {
    const listed = parseJson((await invoke(["skills", "list", "--json"])).stdout) as {
      readonly skills: readonly { readonly name: string }[];
    };
    expect(listed.skills.map((skill) => skill.name)).toEqual([
      "core",
      "sheet",
      "doc",
      "slide",
      "base",
      "board",
      "embed",
      "cross-unit-formula",
    ]);

    const core = parseJson((await invoke(["skills", "get", "core", "--json"])).stdout) as {
      readonly skills: readonly { readonly content: string; readonly name: string }[];
    };
    expect(core.skills[0]).toMatchObject({ name: "core" });
    expect(core.skills[0]?.content).toContain(
      "A `ready` worktree rejects writes until it is explicitly reopened",
    );

    const all = parseJson(
      (await invoke(["skills", "get", "--all", "--full", "--json"])).stdout,
    ) as {
      readonly skills: readonly {
        readonly files: readonly unknown[];
        readonly name: string;
      }[];
    };
    expect(all.skills.map((skill) => skill.name)).toEqual(listed.skills.map((skill) => skill.name));
    expect(all.skills.every((skill) => Array.isArray(skill.files))).toBe(true);

    const discovery = parseJson(
      (await invoke(["skills", "get", "univer-cli", "--json"])).stdout,
    ) as { readonly skills: readonly { readonly name: string }[] };
    expect(discovery.skills).toEqual([expect.objectContaining({ name: "univer-cli" })]);

    const located = parseJson((await invoke(["skills", "path", "core", "--json"])).stdout) as {
      readonly name: string;
      readonly path: string;
    };
    expect(located).toEqual({
      name: "core",
      path: join(projectRoot, "dist", "skills", "runtime", "core"),
    });
    await expect(access(join(located.path, "SKILL.md"))).resolves.toBeUndefined();
  });

  it("completes the Local Univerfile, Gateway, Viewer, migration, and daemon read loop", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "univer-cli-built-")));
    const home = join(root, "home");
    const port = await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      UNIVER_HOME: home,
    };
    delete env.UNIVER_COLLAB_GATEWAY_PORT;
    const currentFile = join(root, "current.univer");
    const importedFile = join(root, "imported.univer");
    const remoteImportedFile = join(root, "remote-imported.univer");
    const optimizedFile = join(root, "optimized.univer");
    const sourceCsv = join(root, "inventory.csv");
    const exportedXlsx = join(root, "inventory.xlsx");
    const exportedCsv = join(root, "inventory-export.csv");
    const exportedBaseTsv = join(root, "tasks.tsv");
    const sheetShots = join(root, "sheet-shots");
    const slideShots = join(root, "slide-shots");
    const docShots = join(root, "doc-shots");
    const boardShots = join(root, "board-shots");
    const baseShots = join(root, "base-shots");
    const authoringSvg = join(root, "page.svg");
    const typstBundle = join(root, "paper");
    const legacyFile = join(root, "legacy.univer");
    const legacyActiveFile = join(root, "legacy-active.univer");

    try {
      const configuredPort = parseJson(
        (await invoke(["config", "set", "collabGateway.port", String(port), "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(configuredPort).toMatchObject({
        entry: { key: "collabGateway.port", source: "config", value: port },
      });
      const publicConfig = parseJson((await invoke(["config", "list", "--json"], env)).stdout) as {
        readonly entries: readonly { readonly key: string }[];
      };
      expect(publicConfig.entries.map((entry) => entry.key)).toEqual([
        "collabGateway.port",
        "screenshot.maxPages",
        "screenshot.maxPixels",
        "update.checkOnStartup",
        "univerRuntime.license",
      ]);

      const created = parseJson(
        (await invoke(["new", currentFile, "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(created).toEqual({ filePath: currentFile });

      const status = parseJson(
        (await invoke(["status", currentFile, "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(status).toMatchObject({
        filePath: currentFile,
        scope: "trunk",
        units: [],
        upgrade: { status: "unchanged", format: "v2" },
      });

      await writeFile(sourceCsv, "item,quantity\nWidget,7\n", "utf8");
      const imported = parseJson(
        (
          await invoke(
            [
              "import",
              importedFile,
              "--file",
              sourceCsv,
              "--name",
              "Inventory",
              "--formula-calculation",
              "when_empty",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly unitId: string };
      expect(imported).toMatchObject({
        filePath: importedFile,
        kind: "sheet",
        name: "Inventory",
        scope: "trunk",
        type: 2,
      });
      const importedInspection = parseJson(
        (
          await invoke(
            [
              "inspect",
              "range",
              "A1:B2",
              importedFile,
              "--worksheet",
              "index:1",
              "--unit",
              imported.unitId,
              "--trunk",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly ranges: readonly { readonly displayValues: readonly string[][] }[] };
      expect(importedInspection.ranges[0]?.displayValues).toEqual([
        ["item", "quantity"],
        ["Widget", "7"],
      ]);
      const exported = parseJson(
        (
          await invoke(
            ["export", importedFile, exportedXlsx, "--unit", imported.unitId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(exported).toMatchObject({
        filePath: importedFile,
        kind: "sheet",
        outputPath: exportedXlsx,
        scope: "trunk",
        unitId: imported.unitId,
      });
      expect((await stat(exportedXlsx)).size).toBeGreaterThan(0);
      const exportedDelimited = parseJson(
        (
          await invoke(
            [
              "export",
              importedFile,
              exportedCsv,
              "--unit",
              imported.unitId,
              "--sheet",
              "Sheet1",
              "--formula-calculation",
              "when_empty",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(exportedDelimited).toMatchObject({
        kind: "sheet",
        outputPath: exportedCsv,
        unitId: imported.unitId,
      });
      expect(await readFile(exportedCsv, "utf8")).toContain("Widget,7");

      const sheetScreenshot = parseJson(
        (
          await invoke(
            [
              "screenshot",
              importedFile,
              "--unit",
              imported.unitId,
              "--sheet",
              "Sheet1",
              "--range",
              "A1:B2",
              "--out",
              sheetShots,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly outputs: readonly { readonly location: string }[] };
      expect(sheetScreenshot).toMatchObject({
        ok: true,
        unitId: imported.unitId,
        unitKind: "sheet",
      });
      await expectPng(sheetScreenshot.outputs[0]!.location);

      const dryRun = parseJson(
        (await invoke(["optimize", importedFile, "--dry-run", "--images", "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(dryRun).toMatchObject({ dryRun: true, sourcePath: importedFile });
      const optimized = parseJson(
        (
          await invoke(
            ["optimize", importedFile, "--out", optimizedFile, "--images", "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(optimized).toMatchObject({
        dryRun: false,
        outputPath: optimizedFile,
        sourcePath: importedFile,
      });
      expect((await stat(optimizedFile)).size).toBeGreaterThan(0);

      const authoringWorktree = parseJson(
        (await invoke(["worktree", "add", importedFile, "--name", "authoring", "--json"], env))
          .stdout,
      ) as { readonly worktreeId: string };
      const slide = parseJson(
        (
          await invoke(
            [
              "unit",
              "add",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--type",
              "slide",
              "--name",
              "Deck",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly unitId: string };
      const board = parseJson(
        (
          await invoke(
            [
              "unit",
              "add",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--type",
              "board",
              "--name",
              "Board",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly unitId: string };
      const base = parseJson(
        (
          await invoke(
            [
              "unit",
              "add",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--type",
              "base",
              "--name",
              "Base",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly unitId: string };
      const boardExecution = parseJson(
        (
          await invoke(
            [
              "execute",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              board.unitId,
              "-e",
              "const shape = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.Rect, transform: { left: 20, top: 20, width: 240, height: 120 } }); shape.getText().setText('Board'); return shape.getId();",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly value: string };
      await invoke(
        [
          "execute",
          importedFile,
          "--worktree",
          authoringWorktree.worktreeId,
          "--unit",
          base.unitId,
          "-e",
          `const table = base.insertTable("Tasks", { primaryFieldName: "Title" }); table.addRecord({ [table.getPrimaryFieldId()]: "Task" }); table.createView("Grid", api.Enum.BaseViewType.Grid); return table.getId();`,
          "--json",
        ],
        env,
      );
      const inspectedBase = parseJson(
        (
          await invoke(
            [
              "inspect",
              "base",
              importedFile,
              "--unit",
              base.unitId,
              "--worktree",
              authoringWorktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as {
        readonly kind: string;
        readonly tables: readonly {
          readonly fields: readonly { readonly name: string }[];
          readonly name: string;
          readonly recordCount: number;
          readonly views: readonly { readonly type: string }[];
        }[];
      };
      expect(inspectedBase).toMatchObject({ kind: "base" });
      expect(inspectedBase.tables[0]).toMatchObject({
        name: "Table 1",
        recordCount: 0,
        views: [expect.objectContaining({ type: "grid" })],
      });
      const tasksOverview = inspectedBase.tables.find((table) => table.name === "Tasks");
      expect(tasksOverview).toMatchObject({ recordCount: 1 });
      expect(tasksOverview?.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Title" })]),
      );

      const inspectedBoard = parseJson(
        (
          await invoke(
            [
              "inspect",
              "board",
              importedFile,
              "--unit",
              board.unitId,
              "--worktree",
              authoringWorktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as {
        readonly elementCounts: { readonly total: number };
        readonly elements: readonly { readonly id: string; readonly text?: string }[];
        readonly kind: string;
      };
      expect(inspectedBoard).toMatchObject({ elementCounts: { total: 1 }, kind: "board" });
      expect(inspectedBoard.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: boardExecution.value, text: "Board" }),
        ]),
      );

      const inspectedBoardElement = parseJson(
        (
          await invoke(
            [
              "inspect",
              "board-element",
              `id:${boardExecution.value}`,
              importedFile,
              "--unit",
              board.unitId,
              "--worktree",
              authoringWorktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly elements: readonly { readonly id: string; readonly type: string }[] };
      expect(inspectedBoardElement.elements).toEqual([
        expect.objectContaining({ id: boardExecution.value, type: "shape" }),
      ]);
      const exportedBase = parseJson(
        (
          await invoke(
            [
              "export",
              importedFile,
              exportedBaseTsv,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              base.unitId,
              "--table",
              "Tasks",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(exportedBase).toMatchObject({
        kind: "base",
        outputPath: exportedBaseTsv,
        unitId: base.unitId,
        worktreeId: authoringWorktree.worktreeId,
      });
      expect(await readFile(exportedBaseTsv, "utf8")).toContain("Task");
      await writeFile(
        authoringSvg,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" fill="#fff"/><text x="20" y="40">Phase 3</text></svg>',
        "utf8",
      );
      const appliedSvg = parseJson(
        (
          await invoke(
            [
              "compile-svg",
              authoringSvg,
              "--page",
              "1",
              "--apply",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              slide.unitId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(appliedSvg).toMatchObject({
        applied: { committed: true, unitId: slide.unitId },
        page: 1,
        textMeasure: "browser-render-runtime",
      });
      const slidePages = parseJson(
        (
          await invoke(
            [
              "execute",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              slide.unitId,
              "-e",
              "return presentation.getSlides().length;",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(slidePages).toMatchObject({ committed: false, value: 1 });
      const slideScreenshot = parseJson(
        (
          await invoke(
            [
              "screenshot",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              slide.unitId,
              "--pages",
              "1",
              "--out",
              slideShots,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly outputs: readonly { readonly location: string }[] };
      expect(slideScreenshot).toMatchObject({ ok: true, unitId: slide.unitId, unitKind: "slide" });
      await expectPng(slideScreenshot.outputs[0]!.location);
      const slideLint = parseJson(
        (
          await invoke(
            [
              "lint",
              "--file",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              slide.unitId,
              "--pages",
              "1",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as {
        readonly coverage: {
          readonly pages: readonly unknown[];
          readonly rules: readonly string[];
        };
        readonly findings: readonly unknown[];
      };
      expect(slideLint).toMatchObject({
        kind: "unit-layout-lint",
        unitId: slide.unitId,
        unitType: "slide",
      });
      expect(slideLint.coverage.pages).toHaveLength(1);
      expect(slideLint.coverage.rules).toEqual([
        "text-off-page",
        "text-escapes-container",
        "text-overlaps-text",
      ]);
      expect(Array.isArray(slideLint.findings)).toBe(true);
      const boardScreenshot = parseJson(
        (
          await invoke(
            [
              "screenshot",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              board.unitId,
              "--out",
              boardShots,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly outputs: readonly { readonly location: string }[] };
      expect(boardScreenshot).toMatchObject({
        ok: true,
        unitId: board.unitId,
        unitKind: "board",
      });
      await expectPng(boardScreenshot.outputs[0]!.location);
      const baseScreenshot = parseJson(
        (
          await invoke(
            [
              "screenshot",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              base.unitId,
              "--out",
              baseShots,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly outputs: readonly { readonly location: string }[] };
      expect(baseScreenshot).toMatchObject({
        ok: true,
        unitId: base.unitId,
        unitKind: "base",
      });
      await expectPng(baseScreenshot.outputs[0]!.location);

      await mkdir(typstBundle);
      await writeFile(join(typstBundle, "page.typ"), "= Applied Doc\n\nPhase 3", "utf8");
      await writeFile(
        join(typstBundle, "typst.json"),
        JSON.stringify({
          schemaVersion: 1,
          targetUnitId: "doc-typst-1",
          title: "Applied Doc",
          pages: ["page.typ"],
        }),
        "utf8",
      );
      const appliedTypst = parseJson(
        (
          await invoke(
            [
              "compile-typst",
              typstBundle,
              "--apply",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(appliedTypst).toMatchObject({
        applied: { kind: "doc", unitId: "doc-typst-1" },
        targetUnitId: "doc-typst-1",
      });
      const documentInspection = parseJson(
        (
          await invoke(
            [
              "inspect",
              "document",
              importedFile,
              "--unit",
              "doc-typst-1",
              "--worktree",
              authoringWorktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      );
      expect(JSON.stringify(documentInspection)).toContain("Applied Doc");
      const docScreenshot = parseJson(
        (
          await invoke(
            [
              "screenshot",
              importedFile,
              "--worktree",
              authoringWorktree.worktreeId,
              "--unit",
              "doc-typst-1",
              "--out",
              docShots,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly outputs: readonly { readonly location: string }[] };
      expect(docScreenshot).toMatchObject({ ok: true, unitId: "doc-typst-1", unitKind: "doc" });
      await expectPng(docScreenshot.outputs[0]!.location);
      await invoke(
        ["worktree", "discard", importedFile, "--worktree", authoringWorktree.worktreeId, "--json"],
        env,
      );

      const worktree = parseJson(
        (await invoke(["worktree", "add", currentFile, "--name", "phase-2", "--json"], env)).stdout,
      ) as { readonly worktreeId: string };
      const added = parseJson(
        (
          await invoke(
            [
              "unit",
              "add",
              currentFile,
              "--worktree",
              worktree.worktreeId,
              "--type",
              "sheet",
              "--name",
              "Plan",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly unitId: string };
      const executed = parseJson(
        (
          await invoke(
            [
              "execute",
              currentFile,
              "--worktree",
              worktree.worktreeId,
              "--unit",
              added.unitId,
              "-e",
              'const sheet = workbook.getActiveSheet(); sheet.getRange("A1").setValue("phase-2"); const calculated = api.getFormula().onCalculationResultApplied(); sheet.getRange("B1").setFormula("=1+1"); await calculated; return sheet.getRange("B1").getCellDatas()[0][0].v;',
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(executed).toMatchObject({
        committed: true,
        revision: 2,
        unitId: added.unitId,
        value: 2,
        worktreeId: worktree.worktreeId,
      });
      const readOnlyExecution = parseJson(
        (
          await invoke(
            [
              "execute",
              currentFile,
              "--worktree",
              worktree.worktreeId,
              "--unit",
              added.unitId,
              "-e",
              'return workbook.getActiveSheet().getRange("A1").getValue();',
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(readOnlyExecution).toMatchObject({ committed: false, value: "phase-2" });
      expect(readOnlyExecution).not.toHaveProperty("revision");

      const worktreeInspection = parseJson(
        (
          await invoke(
            [
              "inspect",
              "range",
              "A1",
              currentFile,
              "--worksheet",
              "name:Sheet1",
              "--unit",
              added.unitId,
              "--worktree",
              worktree.worktreeId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly ranges: readonly { readonly displayValues: readonly string[][] }[] };
      expect(worktreeInspection.ranges[0]?.displayValues).toEqual([["phase-2"]]);

      const ready = parseJson(
        (
          await invoke(
            ["worktree", "ready", currentFile, "--worktree", worktree.worktreeId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(ready).toMatchObject({ status: "ready", worktreeId: worktree.worktreeId });

      const merged = parseJson(
        (
          await invoke(
            ["worktree", "merge", currentFile, "--worktree", worktree.worktreeId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(merged).toMatchObject({
        status: "merged",
        worktreeId: worktree.worktreeId,
      });

      const trunkInspection = parseJson(
        (
          await invoke(
            [
              "inspect",
              "range",
              "A1",
              currentFile,
              "--worksheet",
              "name:Sheet1",
              "--unit",
              added.unitId,
              "--trunk",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly ranges: readonly { readonly displayValues: readonly string[][] }[] };
      expect(trunkInspection.ranges[0]?.displayValues).toEqual([["phase-2"]]);

      const trunkUnits = parseJson(
        (await invoke(["unit", "list", currentFile, "--json"], env)).stdout,
      ) as { readonly units: readonly { readonly kind: string; readonly unitId: string }[] };
      expect(trunkUnits.units).toEqual([
        expect.objectContaining({ kind: "sheet", unitId: added.unitId }),
      ]);

      const review = parseJson(
        (await invoke(["worktree", "add", currentFile, "--name", "review", "--json"], env)).stdout,
      ) as { readonly worktreeId: string };
      const listedWorktrees = parseJson(
        (await invoke(["worktree", "list", currentFile, "--json"], env)).stdout,
      ) as {
        readonly worktrees: readonly {
          readonly agentId: string;
          readonly createdAt: string;
          readonly worktreeId: string;
        }[];
      };
      expect(listedWorktrees.worktrees).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: "",
            createdAt: expect.any(String),
            worktreeId: review.worktreeId,
          }),
        ]),
      );
      await invoke(
        ["worktree", "ready", currentFile, "--worktree", review.worktreeId, "--json"],
        env,
      );
      const reopenedReview = parseJson(
        (
          await invoke(
            ["worktree", "reopen", currentFile, "--worktree", review.worktreeId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(reopenedReview).toMatchObject({ status: "draft", worktreeId: review.worktreeId });
      const discardedReview = parseJson(
        (
          await invoke(
            ["worktree", "discard", currentFile, "--worktree", review.worktreeId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(discardedReview).toMatchObject({
        status: "discarded",
        worktreeId: review.worktreeId,
      });

      const removal = parseJson(
        (await invoke(["worktree", "add", currentFile, "--name", "remove", "--json"], env)).stdout,
      ) as { readonly worktreeId: string };
      const removed = parseJson(
        (
          await invoke(
            [
              "unit",
              "remove",
              currentFile,
              "--worktree",
              removal.worktreeId,
              "--unit",
              added.unitId,
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(removed).toMatchObject({ removed: true, unitId: added.unitId });
      await invoke(
        ["worktree", "ready", currentFile, "--worktree", removal.worktreeId, "--json"],
        env,
      );
      await invoke(
        ["worktree", "merge", currentFile, "--worktree", removal.worktreeId, "--json"],
        env,
      );
      const emptyTrunk = parseJson(
        (await invoke(["unit", "list", currentFile, "--json"], env)).stdout,
      ) as { readonly units: readonly unknown[] };
      expect(emptyTrunk.units).toEqual([]);

      const opened = parseJson((await invoke(["open", currentFile, "--json"], env)).stdout) as {
        readonly openUrl: string;
      };
      expect(opened).not.toHaveProperty("ok");
      const openUrl = new URL(opened.openUrl);
      expect(openUrl.origin).toBe(`http://127.0.0.1:${String(port)}`);
      const fileKey = openUrl.searchParams.get("file");
      expect(fileKey).toBeTruthy();

      const viewer = await fetch(opened.openUrl);
      expect(viewer.status).toBe(200);
      expect(await viewer.text()).toContain('<div id="app"></div>');

      const descriptor = await fetch(`${openUrl.origin}/uf/${fileKey!}`, {
        headers: { accept: GATEWAY_DESCRIPTOR_MEDIA_TYPE },
      });
      expect(descriptor.status).toBe(200);
      expect(descriptor.headers.get("content-type")).toContain(GATEWAY_DESCRIPTOR_MEDIA_TYPE);
      expect(await descriptor.json()).toMatchObject({ protocolVersion: 1 });

      await createV1Fixture(legacyFile);
      const sourceHash = await sha256(legacyFile);
      const migrated = parseJson(
        (await invoke(["status", legacyFile, "--unit", "unit-1", "--json"], env)).stdout,
      ) as {
        readonly units: readonly { readonly headRev: number; readonly unitId: string }[];
        readonly upgrade: {
          readonly backupPath: string;
          readonly backupSha256: string;
          readonly omitted: readonly string[];
          readonly sourceFormat: string;
          readonly status: string;
          readonly targetFormat: string;
        };
      };
      expect(migrated.units).toEqual([expect.objectContaining({ unitId: "unit-1", headRev: 1 })]);
      expect(migrated.upgrade).toMatchObject({
        status: "upgraded",
        sourceFormat: "v1",
        targetFormat: "v2",
        backupSha256: sourceHash,
        omitted: ["logical-commit-history"],
      });
      await access(migrated.upgrade.backupPath);
      expect(await sha256(migrated.upgrade.backupPath)).toBe(sourceHash);

      const reopened = parseJson(
        (await invoke(["status", legacyFile, "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(reopened).toMatchObject({ upgrade: { status: "unchanged", format: "v2" } });

      const legacyActive = await createV1ActiveWorktreeFixture(legacyActiveFile);
      const activeStatus = parseJson(
        (
          await invoke(
            ["status", legacyActiveFile, "--worktree", legacyActive.worktreeId, "--json"],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(activeStatus).toMatchObject({
        upgrade: { sourceFormat: "v1", status: "upgraded", targetFormat: "v2" },
        worktree: { status: "draft", worktreeId: legacyActive.worktreeId },
      });
      const continued = parseJson(
        (
          await invoke(
            [
              "execute",
              legacyActiveFile,
              "--worktree",
              legacyActive.worktreeId,
              "--unit",
              legacyActive.unitId,
              "-e",
              'workbook.getActiveSheet().getRange("B2").setValue("continued"); return "ok";',
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as Record<string, unknown>;
      expect(continued).toMatchObject({ committed: true, revision: 2, value: "ok" });
      await invoke(
        ["worktree", "ready", legacyActiveFile, "--worktree", legacyActive.worktreeId, "--json"],
        env,
      );
      await invoke(
        ["worktree", "merge", legacyActiveFile, "--worktree", legacyActive.worktreeId, "--json"],
        env,
      );
      const continuedInTrunk = parseJson(
        (
          await invoke(
            [
              "inspect",
              "range",
              "B2",
              legacyActiveFile,
              "--worksheet",
              "name:Sheet 1",
              "--unit",
              legacyActive.unitId,
              "--trunk",
              "--json",
            ],
            env,
          )
        ).stdout,
      ) as { readonly ranges: readonly { readonly displayValues: readonly string[][] }[] };
      expect(continuedInTrunk.ranges[0]?.displayValues).toEqual([["continued"]]);

      const remoteSource = await serveRemoteCsv();
      try {
        const remoteImported = parseJson(
          (await invoke(["import", remoteImportedFile, "--file", remoteSource.url, "--json"], env))
            .stdout,
        ) as { readonly sourcePath: string; readonly unitId: string };
        expect(remoteImported).toMatchObject({
          filePath: remoteImportedFile,
          kind: "sheet",
          name: "remote inventory",
          sourcePath: remoteSource.url,
        });
        const remoteInspection = parseJson(
          (
            await invoke(
              [
                "inspect",
                "range",
                "A1:B2",
                remoteImportedFile,
                "--worksheet",
                "index:1",
                "--unit",
                remoteImported.unitId,
                "--trunk",
                "--json",
              ],
              env,
            )
          ).stdout,
        ) as { readonly ranges: readonly { readonly displayValues: readonly string[][] }[] };
        expect(remoteInspection.ranges[0]?.displayValues).toEqual([
          ["item", "quantity"],
          ["Remote Widget", "9"],
        ]);
      } finally {
        await remoteSource.close();
      }

      const daemon = parseJson(
        (await invoke(["daemon", "status", "--json"], env)).stdout,
      ) as Record<string, unknown>;
      expect(daemon).toMatchObject({ state: "running" });

      const stopped = parseJson((await invoke(["daemon", "stop", "--json"], env)).stdout) as Record<
        string,
        unknown
      >;
      expect(stopped).toMatchObject({ state: "stopped", stopped: true });
    } finally {
      await invoke(["daemon", "stop", "--json"], env).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});

async function invoke(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  return await execFileAsync(process.execPath, [executable, ...argv], {
    cwd: projectRoot,
    encoding: "utf8",
    env,
    timeout: 180_000,
  });
}

async function serveRemoteCsv(): Promise<{
  readonly close: () => Promise<void>;
  readonly url: string;
}> {
  const server = createHttpServer((request, response) => {
    if (new URL(request.url ?? "/", "http://127.0.0.1").pathname !== "/remote%20inventory.csv") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/csv" });
    response.end("item,quantity\nRemote Widget,9\n");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Failed to start remote import fixture server");
  }
  return {
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
    url: `http://127.0.0.1:${String(address.port)}/remote%20inventory.csv?signature=test`,
  };
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

async function expectPng(filename: string): Promise<void> {
  const bytes = await readFile(filename);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Failed to allocate a loopback port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}

async function sha256(filename: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filename))
    .digest("hex");
}
