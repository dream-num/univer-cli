import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { FileSource, UniverType } from "@univerjs/protocol";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freePort, invoke } from "./built-cli.js";

const fixtures = join(import.meta.dirname, "fixtures", "exchange");

describe("embedded images in Office exchange", () => {
  let root: string;
  let env: NodeJS.ProcessEnv;
  let origin: string;
  let png: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "univer-office-images-")));
    const port = await freePort();
    env = {
      ...process.env,
      UNIVER_HOME: join(root, "home"),
      UNIVER_COLLAB_GATEWAY_PORT: String(port),
    };
    origin = `http://127.0.0.1:${port}`;
    const source = unzipSync(await readFile(join(fixtures, "slide-picture.pptx")));
    png = Uint8Array.from(source["ppt/media/image1.png"]!);
  });

  afterAll(async () => {
    try {
      if (env) await invoke(["daemon", "stop", "--json"], env);
    } finally {
      if (root) await rm(root, { force: true, recursive: true });
    }
  });

  async function cli<T = unknown>(...args: string[]): Promise<T> {
    return JSON.parse((await invoke([...args, "--json"], env)).stdout);
  }

  it.each([
    {
      name: "slide-picture",
      kind: "slide",
      type: UniverType.UNIVER_SLIDE,
      format: "pptx",
      folder: "ppt/slides",
    },
    {
      name: "layout-picture",
      kind: "slide",
      type: UniverType.UNIVER_SLIDE,
      format: "pptx",
      folder: "ppt/slideLayouts",
    },
    { name: "document", kind: "doc", type: UniverType.UNIVER_DOC, format: "docx", folder: "word" },
    {
      name: "worksheet",
      kind: "sheet",
      type: UniverType.UNIVER_SHEET,
      format: "xlsx",
      folder: "xl/drawings",
    },
  ])(
    "preserves the $name picture in CLI and Gateway exports",
    async ({ name, kind, type, format, folder }) => {
      const file = join(root, name + ".univer");
      const base = origin + "/uf/" + Buffer.from(file).toString("base64url");
      await cli("new", file);
      const { worktreeId } = await cli<{ worktreeId: string }>(
        "worktree",
        "add",
        file,
        "--name",
        name,
      );
      const draft = ["--worktree", worktreeId];
      const { unitId } =
        kind === "slide"
          ? await cli<{ unitId: string }>(
              "import",
              file,
              "--file",
              join(fixtures, name + ".pptx"),
              ...draft,
            )
          : await cli<{ unitId: string }>(
              "unit",
              "add",
              file,
              "--type",
              kind,
              "--name",
              name,
              ...draft,
            );
      if (kind !== "slide") {
        const form = new FormData();
        form.append("file", new Blob([png], { type: "image/png" }), "picture.png");
        const upload = await fetch(
          `${base}/worktrees/${worktreeId}/universer-api/stream/file/upload?source=${FileSource.UnitEmbedded}&assign=${unitId}&size=${png.length}`,
          { method: "POST", body: form },
        );
        expect(upload.status).toBe(201);
        const assetId = JSON.stringify(((await upload.json()) as { FileId: string }).FileId);
        const insert =
          kind === "doc"
            ? `const p = doc.getParagraphs()[0];
           return !!(await doc.insertImage({source: ${assetId}, imageSourceType: api.Enum.ImageSourceType.UUID,
             width: 32, height: 32, textRange: {startOffset: p.getRange().startOffset, segmentId: p.getSegmentId()}}));`
            : `const sheet = workbook.getActiveSheet();
           const image = await sheet.newOverGridImage().setSource(${assetId}, api.Enum.ImageSourceType.UUID)
             .setColumn(1).setRow(1).setWidth(32).setHeight(32).buildAsync();
           sheet.insertImages([image]); return true;`;
        expect(await cli("execute", file, ...draft, "--unit", unitId, "-e", insert)).toMatchObject({
          committed: true,
          value: true,
        });
      }

      const out = join(root, name + "." + format);
      await cli("export", file, out, "--unit", unitId, ...draft);
      expectPicture(await readFile(out), folder, png);

      await cli("worktree", "ready", file, ...draft);
      await cli("worktree", "merge", file, ...draft);
      const trunkOut = join(root, name + "-trunk." + format);
      await cli("export", file, trunkOut, "--unit", unitId);
      expectPicture(await readFile(trunkOut), folder, png);

      const exchange = base + "/universer-api";
      const task = await runExchangeTask<{ export: { fileID: string } }>(
        exchange,
        `${type}/export`,
        { unitID: unitId, format },
      );
      const signed = (await (
        await fetch(`${exchange}/file/${task.export.fileID}/sign-url`)
      ).json()) as { url: string };
      const downloaded = await fetch(new URL(signed.url, origin));
      expect(downloaded.ok).toBe(true);
      expectPicture(new Uint8Array(await downloaded.arrayBuffer()), folder, png);
    },
    45_000,
  );
  it.each([
    {
      filename: "layout-picture.pptx",
      type: UniverType.UNIVER_SLIDE,
      facade: "presentation",
      folder: "ppt/slideLayouts",
    },
    { filename: "picture.docx", type: UniverType.UNIVER_DOC, facade: "doc", folder: "word" },
    {
      filename: "picture.xlsx",
      type: UniverType.UNIVER_SHEET,
      facade: "workbook",
      folder: "xl/drawings",
    },
  ])(
    "imports $filename with scoped file references through the CLI and Gateway",
    async ({ filename, type, facade, folder }) => {
      const file = join(root, filename + ".univer");
      const input = join(fixtures, filename);
      const first = await cli<{ unitId: string }>("import", file, "--file", input);
      const exchange = origin + "/uf/" + Buffer.from(file).toString("base64url") + "/universer-api";
      const bytes = await readFile(input);
      const form = new FormData();
      form.append("file", new Blob([Uint8Array.from(bytes)]), filename);
      const upload = await fetch(
        `${exchange}/stream/file/upload?source=${FileSource.HttpImport}&size=${bytes.length}`,
        { method: "POST", body: form },
      );
      expect(upload.status).toBe(201);
      const { FileId } = (await upload.json()) as { FileId: string };
      const imported = await runExchangeTask<{ import: { unitID: string } }>(
        exchange,
        `${type}/import`,
        { fileID: FileId, outputType: 1 },
      );
      const { worktreeId } = await cli<{ worktreeId: string }>(
        "worktree",
        "add",
        file,
        "--name",
        "images",
      );
      const draft = await cli<{ unitId: string }>(
        "import",
        file,
        "--file",
        input,
        "--worktree",
        worktreeId,
      );

      const db = new DatabaseSync(file, { readOnly: true });
      try {
        for (const [unitId, scope] of [
          [first.unitId, null],
          [imported.import.unitID, null],
          [draft.unitId, worktreeId],
        ] as const) {
          const rows = db
            .prepare(
              "SELECT asset_id, worktree_id, original_filename, media_type, bytes FROM collaboration_assets JOIN collaboration_asset_blobs USING (digest) WHERE unit_id = ?",
            )
            .all(unitId);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            worktree_id: scope,
            original_filename: "image1.png",
            media_type: "image/png",
            bytes: png,
          });
          const { value } = await cli<{ value: string }>(
            "execute",
            file,
            "--unit",
            unitId,
            "--worktree",
            worktreeId,
            "-e",
            `return JSON.stringify(${facade}.save())`,
          );
          expect(value).toContain(rows[0]!.asset_id);
          // XLSX can retain original OOXML parts separately from drawing sources.
          expect(value).not.toContain(
            "data:image/png;base64," + Buffer.from(png).toString("base64"),
          );
          const out = join(root, unitId + "-" + filename);
          await cli("export", file, out, "--unit", unitId, ...(scope ? ["--worktree", scope] : []));
          expectPicture(await readFile(out), folder, png);
        }
        // A JSON-only conversion has no Unit to own assets. Its snapshot must export on its own.
        const json = await runExchangeTask<{ import: { jsonID: string } }>(
          exchange,
          `${type}/import`,
          { fileID: FileId, outputType: 2 },
        );
        const result = await runExchangeTask<{ export: { fileID: string } }>(
          exchange,
          `${type}/export`,
          { jsonID: json.import.jsonID, format: filename.split(".").pop() },
        );
        const downloaded = await fetch(`${exchange}/file/${result.export.fileID}/content`);
        expect(downloaded.ok).toBe(true);
        expectPicture(new Uint8Array(await downloaded.arrayBuffer()), folder, png);
        expect(
          db.prepare("SELECT COUNT(*) AS assets FROM collaboration_assets").get()?.assets,
        ).toBe(3);
        expect(
          db.prepare("SELECT COUNT(*) AS blobs FROM collaboration_asset_blobs").get()?.blobs,
        ).toBe(1);
      } finally {
        db.close();
      }
    },
    45_000,
  );
});

async function runExchangeTask<T>(exchange: string, action: string, body: object): Promise<T> {
  const started = await fetch(`${exchange}/exchange/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(started.ok).toBe(true);
  const { taskID } = (await started.json()) as { taskID: string };
  const readTask = async () =>
    (await (await fetch(`${exchange}/exchange/task/${taskID}`)).json()) as T & {
      status: string;
      error: { message: string };
    };
  await expect.poll(async () => (await readTask()).status, { timeout: 15_000 }).not.toBe("pending");
  const task = await readTask();
  expect(task.status, task.error.message).toBe("done");
  return task;
}

// Follow the drawing's relationship so orphaned media or a layout picture moved to a slide fails.
function expectPicture(archive: Uint8Array, folder: string, png: Uint8Array): void {
  const parts = unzipSync(archive);
  const images = [];
  for (const [part, bytes] of Object.entries(parts)) {
    if (posix.dirname(part) !== folder || !part.endsWith(".xml")) continue;
    for (const [, id] of strFromU8(bytes).matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/gu)) {
      const rels = parts[`${folder}/_rels/${posix.basename(part)}.rels`]!;
      const rel = strFromU8(rels)
        .match(/<Relationship\s[^>]+>/gu)
        ?.find((tag) => tag.includes(` Id="${id}"`));
      const target = rel?.match(/ Target="([^"]+)"/u)?.[1];
      expect(target).toBeDefined();
      images.push(parts[posix.resolve("/", folder, target!).slice(1)]);
    }
  }
  expect(images).toEqual([png]);
}
