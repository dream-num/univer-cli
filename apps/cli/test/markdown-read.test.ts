import { access, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalUnitContentApplication } from "../src/features/unit-content/service.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const sourceMap = [
  {
    id: "intro",
    kind: "block",
    paragraphIds: ["current-p"],
    objectIds: [],
    source: { line: 1, column: 1, offset: 0, endOffset: 10 },
  },
  {
    id: "keep",
    kind: "paragraph",
    paragraphIds: ["untouched-p"],
    objectIds: [],
    source: { line: 3, column: 1, offset: 12, endOffset: 20 },
  },
];
const current = {
  formatVersion: 1,
  unitId: "doc",
  blockIds: ["intro"],
  markdown: ":::block{#intro}\n用户已修改的 **中文**。\n:::\n",
  assets: [],
  diagnostics: [],
  sourceMap,
};

async function fixture(value: unknown = current) {
  const directory = await mkdtemp(join(tmpdir(), "univer-markdown-read-"));
  directories.push(directory);
  const map = join(directory, "runtime-map.json"),
    out = join(directory, "fragment.md");
  await writeFile(map, JSON.stringify({ unitId: "doc", sourceMap }));
  const read = vi.fn(async () => ({
    filePath: "/tmp/book.univer",
    unitId: "doc",
    worktreeId: "ready",
    revision: 8,
    value,
  }));
  const execute = vi.fn(async () => {
    throw new Error("Export must not write native content");
  });
  const readAsset = vi.fn(async () => ({
    data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>').toString(
      "base64",
    ),
    mimeType: "image/svg+xml",
  }));
  let stdout = "",
    stderr = "";
  const application = {
    read,
    readAsset,
    execute,
    async inspect() {
      throw new Error("unexpected inspection");
    },
  } as LocalUnitContentApplication;
  const invoke = async () => {
    const code = await runCli(
      [
        "export-markdown",
        "book.univer",
        "--worktree",
        "ready",
        "--unit",
        "doc",
        "--blocks",
        "intro",
        "--source-map",
        map,
        "--out",
        out,
        "--json",
      ],
      {
        program: { unitContentApplication: application },
        streams: {
          writeOut: (value) => {
            stdout += value;
          },
          writeErr: (value) => {
            stderr += value;
          },
        },
      },
    );
    return { code, stdout, stderr };
  };
  return { directory, out, read, readAsset, execute, invoke };
}

describe("read current native Markdown", () => {
  it("resolves current native image file IDs through the scoped application asset port", async () => {
    const test = await fixture({
      ...current,
      assets: [
        {
          path: "assets/native-1.image",
          kind: "image",
          mimeType: "application/octet-stream",
          encoding: "reference",
          data: "current-file-id",
        },
      ],
    });
    const result = await test.invoke();
    expect(result.code).toBe(0);
    expect(test.readAsset).toHaveBeenCalledWith({
      path: "book.univer",
      unitId: "doc",
      worktreeId: "ready",
      reference: "current-file-id",
    });
    expect(await readFile(join(test.directory, "assets/native-1.image"), "utf8")).toContain("<svg");
    expect(JSON.parse(result.stdout).assets[0]).toMatchObject({
      encoding: "base64",
      mimeType: "image/svg+xml",
    });
  });
  it("exports current content and the same-read revision without an old Markdown file or mutation", async () => {
    const test = await fixture();
    const result = await test.invoke();
    expect(result.code).toBe(0);
    expect(await readFile(test.out, "utf8")).toBe(current.markdown);
    expect(JSON.parse(await readFile(`${test.out}.map.json`, "utf8"))).toEqual({
      formatVersion: 1,
      unitId: "doc",
      revision: 8,
      sourceMap,
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      revision: 8,
      markdown: current.markdown,
      markdownPath: test.out,
    });
    expect(test.read).toHaveBeenCalledWith(
      expect.objectContaining({ path: "book.univer", unitId: "doc", worktreeId: "ready" }),
    );
    expect(test.execute).not.toHaveBeenCalled();
  });

  it("does not write partial Markdown when native formatting cannot be preserved", async () => {
    const test = await fixture({
      ...current,
      markdown: "",
      diagnostics: [
        {
          severity: "error",
          code: "DOC_MARKDOWN_READ_UNSUPPORTED",
          message: "Unsupported native style",
          blockId: "intro",
        },
      ],
    });
    const result = await test.invoke();
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error).toMatchObject({
      code: "DOC_MARKDOWN_READ_UNSUPPORTED",
      details: { diagnostics: [expect.objectContaining({ blockId: "intro" })] },
    });
    await expect(access(test.out)).rejects.toThrow();
  });

  it("writes image sidecars and keeps their base64 data out of the terminal response", async () => {
    const data = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
    ).toString("base64");
    const test = await fixture({
      ...current,
      assets: [
        {
          path: "assets/image.svg",
          kind: "image",
          mimeType: "image/svg+xml",
          encoding: "base64",
          data,
        },
      ],
    });
    const result = await test.invoke();
    expect(result.code).toBe(0);
    expect(await readFile(join(test.directory, "assets/image.svg"), "utf8")).toContain("<svg");
    expect(result.stdout).not.toContain(data);
    expect(JSON.parse(result.stdout).assets).toEqual([
      { path: "assets/image.svg", kind: "image", mimeType: "image/svg+xml", encoding: "base64" },
    ]);
  });

  it("rejects asset output through a symlink before writing any fragment", async () => {
    const test = await fixture({
      ...current,
      assets: [
        {
          path: "assets/image.svg",
          kind: "image",
          mimeType: "image/svg+xml",
          encoding: "base64",
          data: "PHN2Zy8+",
        },
      ],
    });
    const outside = await mkdtemp(join(tmpdir(), "univer-markdown-outside-"));
    directories.push(outside);
    await symlink(outside, join(test.directory, "assets"), "dir");
    const result = await test.invoke();
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe("DOC_MARKDOWN_EXPORT_PATH_INVALID");
    await expect(access(test.out)).rejects.toThrow();
    await expect(access(join(outside, "image.svg"))).rejects.toThrow();
  });

  it("rejects an asset alias of the Markdown output before writing", async () => {
    const test = await fixture({
      ...current,
      assets: [
        {
          path: "asset.png",
          kind: "image",
          mimeType: "image/png",
          encoding: "base64",
          data: "aW1hZ2U=",
        },
      ],
    });
    await symlink(test.out, join(test.directory, "asset.png"));
    const result = await test.invoke();
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe("DOC_MARKDOWN_EXPORT_PATH_INVALID");
    await expect(access(test.out)).rejects.toThrow();
  });
});
