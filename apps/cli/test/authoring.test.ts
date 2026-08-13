import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalTypstApplication } from "../src/features/typst/service.js";
import type { LocalUnitContentApplication } from "../src/features/unit-content/service.js";
import type { SvgTextMeasurer } from "@univer-cli/svg-facade";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { force: true, recursive: true })),
  );
});

describe("SDK authoring commands", () => {
  it("compiles an SVG with the explicit deterministic estimator", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "page.svg");
    const output = join(directory, "page.js");
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="400" height="200" fill="#fff"/><text x="20" y="40">Hello</text></svg>',
      "utf8",
    );

    const compiled = await invoke([
      "compile-svg",
      source,
      "--page",
      "1",
      "--out",
      output,
      "--estimate-text-size",
      "--json",
    ]);

    expect(compiled.exitCode).toBe(0);
    expect(JSON.parse(compiled.stdout)).toMatchObject({
      mode: "replace",
      out: output,
      page: 1,
      textMeasure: "builtin-estimate",
      viewport: { height: 200, width: 400 },
    });
    expect(await readFile(output, "utf8")).toContain("presentation.setPageSize");
  });

  it("does not silently downgrade browser text measurement to estimation", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "page.svg");
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="20">Text</text></svg>',
      "utf8",
    );

    const result = await invoke(["compile-svg", source, "--json"], {
      svgTextMeasurer: {
        source: "browser-render-runtime",
        async measureLine() {
          throw Object.assign(new Error("Browser text measurement is unavailable"), {
            code: "BROWSER_UNAVAILABLE",
          });
        },
      },
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: "BROWSER_UNAVAILABLE",
        message: expect.stringContaining("Browser text measurement is unavailable"),
      },
      ok: false,
    });
  });

  it("compiles a Typst bundle through the SDK facade package", async () => {
    const directory = await temporaryDirectory();
    const pages = join(directory, "pages");
    const output = join(directory, "document.js");
    await mkdir(pages);
    await writeFile(join(pages, "one.typ"), "= Hello\n\nWorld", "utf8");
    await writeFile(
      join(directory, "typst.json"),
      JSON.stringify({
        schemaVersion: 1,
        targetUnitId: "doc-1",
        title: "Hello",
        pages: ["pages/one.typ"],
      }),
      "utf8",
    );

    const compiled = await invoke(["compile-typst", directory, "--out", output, "--json"]);

    expect(compiled.exitCode).toBe(0);
    expect(JSON.parse(compiled.stdout)).toMatchObject({
      javascriptPath: output,
      targetUnitId: "doc-1",
      title: "Hello",
    });
    expect(await readFile(output, "utf8")).toContain("docMigration.apply");
  });

  it("writes Typst diagnostics and includes them in machine failures", async () => {
    const directory = await temporaryDirectory();
    const pages = join(directory, "pages");
    const output = join(directory, "document.js");
    const diagnostics = join(directory, "diagnostics.json");
    await mkdir(pages);
    await writeFile(join(pages, "one.typ"), "#grid(", "utf8");
    await writeFile(
      join(directory, "typst.json"),
      JSON.stringify({
        schemaVersion: 1,
        targetUnitId: "doc-invalid",
        pages: ["pages/one.typ"],
      }),
      "utf8",
    );

    const compiled = await invoke([
      "compile-typst",
      directory,
      "--out",
      output,
      "--diagnostics-out",
      diagnostics,
      "--json",
    ]);

    expect(compiled.exitCode).toBe(1);
    expect(JSON.parse(compiled.stderr)).toMatchObject({
      error: {
        code: "SAC_DAC_TRANSLATION_FAILED",
        details: {
          diagnostics: [
            expect.objectContaining({
              feature: "typst-evaluator",
              severity: "error",
              sourcePath: "pages/one.typ",
            }),
          ],
        },
      },
      ok: false,
    });
    expect(JSON.parse(await readFile(diagnostics, "utf8"))).toMatchObject({
      schemaVersion: 1,
      diagnostics: [expect.objectContaining({ sourcePath: "pages/one.typ" })],
    });
    await expect(readFile(output, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies SVG and Typst authoring results through the local application seams", async () => {
    const directory = await temporaryDirectory();
    const svg = join(directory, "page.svg");
    const typst = join(directory, "paper");
    await writeFile(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/></svg>',
      "utf8",
    );
    await mkdir(typst);
    await writeFile(join(typst, "page.typ"), "= Applied", "utf8");
    await writeFile(
      join(typst, "typst.json"),
      JSON.stringify({ schemaVersion: 1, targetUnitId: "doc-applied", pages: ["page.typ"] }),
      "utf8",
    );
    const calls: unknown[] = [];
    const unitContent = {
      async execute(input: Parameters<LocalUnitContentApplication["execute"]>[0]) {
        calls.push(input);
        return {
          committed: true,
          filePath: "/tmp/book.univer",
          revision: 2,
          unitId: input.unitId,
          value: null,
          worktreeId: input.worktreeId,
        };
      },
    } as LocalUnitContentApplication;
    const typstApplication = {
      async createDocumentFromProgram(
        input: Parameters<LocalTypstApplication["createDocumentFromProgram"]>[0],
      ) {
        calls.push(input);
        return {
          filePath: "/tmp/book.univer",
          headRev: 1,
          kind: "doc" as const,
          name: input.name,
          type: 1,
          unitId: input.unitId,
          worktreeId: input.worktreeId,
        };
      },
    } as LocalTypstApplication;

    const svgResult = await invoke(
      [
        "compile-svg",
        svg,
        "--page",
        "1",
        "--apply",
        "book.univer",
        "--worktree",
        "wt-1",
        "--unit",
        "slide-1",
        "--estimate-text-size",
        "--json",
      ],
      { typstApplication, unitContentApplication: unitContent },
    );
    expect(svgResult.exitCode).toBe(0);
    expect(JSON.parse(svgResult.stdout)).toMatchObject({
      applied: { committed: true, revision: 2, unitId: "slide-1" },
    });

    const typstResult = await invoke(
      ["compile-typst", typst, "--apply", "book.univer", "--worktree", "wt-1", "--json"],
      { typstApplication, unitContentApplication: unitContent },
    );
    expect(typstResult.exitCode).toBe(0);
    expect(JSON.parse(typstResult.stdout)).toMatchObject({
      applied: { kind: "doc", unitId: "doc-applied", worktreeId: "wt-1" },
      targetUnitId: "doc-applied",
    });
    expect(calls).toHaveLength(2);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "univer-cli-authoring-"));
  directories.push(directory);
  return directory;
}

async function invoke(
  argv: readonly string[],
  program?: {
    readonly svgTextMeasurer?: SvgTextMeasurer;
    readonly typstApplication?: LocalTypstApplication;
    readonly unitContentApplication?: LocalUnitContentApplication;
  },
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    ...(program === undefined ? {} : { program }),
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}
