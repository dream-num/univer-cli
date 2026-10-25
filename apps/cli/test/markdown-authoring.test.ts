import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalUnitContentApplication } from "../src/features/unit-content/service.js";
import type { LocalTypstApplication } from "../src/features/typst/service.js";
import type { UniverLocalProgramOptions } from "../src/program.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function sourceFile(text: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "univer-markdown-"));
  directories.push(directory);
  const source = join(directory, "document.md");
  await writeFile(source, text, "utf8");
  return source;
}

async function invoke(args: string[], options: UniverLocalProgramOptions = {}) {
  let stdout = "";
  let stderr = "";
  const result = await runCli(args, {
    program: options,
    streams: {
      writeOut: (text) => {
        stdout += text;
      },
      writeErr: (text) => {
        stderr += text;
      },
    },
  });
  return { result, stdout, stderr };
}

describe("Markdown authoring", () => {
  it("compiles locally without opening a mutation session", async () => {
    const source = await sourceFile("# Product update\n\nHello **world**.");
    const out = join(source, "..", "document.js");
    const compiled = await invoke([
      "compile-markdown",
      source,
      "--unit",
      "report",
      "--out",
      out,
      "--json",
    ]);
    expect(compiled.result).toBe(0);
    expect(JSON.parse(compiled.stdout)).toMatchObject({ targetUnitId: "report", formatVersion: 1 });
    expect(await readFile(out, "utf8")).toContain("createDocument");
  });

  it("returns actual runtime identities when creating a document", async () => {
    const source = await sourceFile("# Report");
    const sourceMap = [
      {
        id: "intro",
        kind: "paragraph",
        paragraphIds: ["native-1"],
        objectIds: [],
        source: { line: 1, column: 1, offset: 0, endOffset: 8 },
      },
    ];
    const mapPath = join(source, "..", "map.json");
    const typstApplication: LocalTypstApplication = {
      async createDocumentFromProgram(input) {
        return {
          filePath: input.path,
          worktreeId: input.worktreeId,
          unitId: input.unitId,
          name: input.name,
          type: 2,
          kind: "doc",
          headRev: 1,
          value: { sourceMap },
        };
      },
    };
    const created = await invoke(
      [
        "compile-markdown",
        source,
        "--unit",
        "report",
        "--apply",
        "report.univer",
        "--worktree",
        "draft",
        "--source-map-out",
        mapPath,
        "--json",
      ],
      { typstApplication },
    );
    expect(created.result).toBe(0);
    expect(JSON.parse(created.stdout).sourceMap).toEqual(sourceMap);
    expect(JSON.parse(await readFile(mapPath, "utf8"))).toEqual({ unitId: "report", sourceMap });
  });

  it("updates selected blocks using their current native identity map", async () => {
    const source = await sourceFile(":::block{#intro}\nChanged **summary**.\n:::");
    const sourceMap = [
      {
        id: "intro",
        kind: "block",
        paragraphIds: ["native-intro"],
        objectIds: [],
        source: { line: 1, column: 1, offset: 0, endOffset: 10 },
      },
    ];
    const mapPath = join(source, "..", "map.json");
    await writeFile(mapPath, JSON.stringify({ unitId: "report", revision: 4, sourceMap }));
    const execute = vi.fn(async (input: Parameters<LocalUnitContentApplication["execute"]>[0]) => ({
      committed: true,
      filePath: input.path,
      revision: 5,
      unitId: input.unitId,
      worktreeId: input.worktreeId,
      value: { sourceMap },
    }));
    const content: LocalUnitContentApplication = {
      execute,
      async read() {
        throw new Error("Unexpected read");
      },
      async readAsset() {
        throw new Error("Unexpected asset read");
      },
      async inspect() {
        throw new Error("Unexpected inspection");
      },
    };
    const updated = await invoke(
      [
        "compile-markdown",
        source,
        "--unit",
        "report",
        "--apply",
        "report.univer",
        "--worktree",
        "draft",
        "--blocks",
        "intro",
        "--source-map",
        mapPath,
        "--json",
      ],
      { unitContentApplication: content },
    );
    expect(updated.result).toBe(0);
    expect(execute).toHaveBeenCalledWith({
      code: expect.any(String),
      path: "report.univer",
      unitId: "report",
      worktreeId: "draft",
    });
    expect(JSON.parse(updated.stdout).applied).toMatchObject({ committed: true, revision: 5 });
  });

  it("rejects an incomplete update before entering a mutation session", async () => {
    const source = await sourceFile("# Changed");
    const failed = await invoke([
      "compile-markdown",
      source,
      "--unit",
      "report",
      "--apply",
      "report.univer",
      "--worktree",
      "draft",
      "--blocks",
      "intro",
      "--json",
    ]);
    expect(failed.result).toBe(1);
    expect(failed.stderr).toContain("--source-map");
    expect(failed.stdout).toBe("");
  });
});
