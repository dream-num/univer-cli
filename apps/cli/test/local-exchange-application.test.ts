import type { DaemonClient, JsonValue } from "@univer-cli/daemon";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalExchangeApplication } from "../src/features/exchange/service.js";

describe("Local exchange import source adapter", () => {
  it("downloads an HTTP(S) source for the SDK converter and preserves the public URL", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "univer-content-source-test-"));
    let converterPath = "";
    let downloaded = "";
    const source = "https://user:secret@example.test/reports/inventory.csv?signature=private";
    const daemon: DaemonClient = {
      async request(method, payload) {
        expect(method).toBe("univer.content.import");
        const request = payload as Record<string, JsonValue>;
        expect(request["formulaCalculationMode"]).toBe("when_empty");
        converterPath = String(request["sourcePath"]);
        downloaded = await readFile(converterPath, "utf8");
        return {
          filePath: String(request["path"]),
          kind: "sheet",
          name: "inventory",
          scope: "trunk",
          sourcePath: converterPath,
          type: 2,
          unitId: "sheet-1",
        };
      },
    };
    const application = createLocalExchangeApplication(daemon, {
      temporaryRoot,
      async fetch(input) {
        expect(String(input)).toBe(source);
        return new Response("item,quantity\nWidget,7\n", { status: 200 });
      },
    });

    try {
      const result = await application.importFile({
        cwd: temporaryRoot,
        kind: "sheet",
        formulaCalculationMode: "when_empty",
        name: "inventory",
        path: "book.univer",
        sourcePath: source,
      });

      expect(downloaded).toBe("item,quantity\nWidget,7\n");
      expect(converterPath).toMatch(/source\.csv$/u);
      expect(result).toMatchObject({ sourcePath: source, unitId: "sheet-1" });
      await expect(access(converterPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readdir(temporaryRoot)).toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("forwards export formula and selector options with resolved local paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-content-export-test-"));
    let request: Record<string, JsonValue> | undefined;
    const application = createLocalExchangeApplication({
      async request(method, payload) {
        expect(method).toBe("univer.content.export");
        request = payload as Record<string, JsonValue>;
        return {
          filePath: String(request["path"]),
          kind: "base",
          outputPath: String(request["outputPath"]),
          scope: "trunk",
          type: 5,
          unitId: "base-1",
        };
      },
    });

    try {
      await application.exportFile({
        cwd: root,
        formulaCalculationMode: "no",
        outputPath: "tasks.tsv",
        path: "book.univer",
        tableName: "Tasks",
        unitId: "base-1",
      });
      expect(request).toEqual({
        formulaCalculationMode: "no",
        outputPath: join(root, "tasks.tsv"),
        path: join(root, "book.univer"),
        tableName: "Tasks",
        unitId: "base-1",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("redacts signed URLs and removes the temporary directory after download failure", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "univer-content-source-failure-"));
    const source = "https://user:secret@example.test/report.xlsx?signature=private#fragment";
    const application = createLocalExchangeApplication(
      {
        async request() {
          throw new Error("daemon must not be called");
        },
      },
      {
        temporaryRoot,
        async fetch() {
          throw new Error(`network rejected ${source}`);
        },
      },
    );

    try {
      const error = await application
        .importFile({
          kind: "sheet",
          name: "report",
          path: "book.univer",
          sourcePath: source,
        })
        .catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code: "IMPORT_REMOTE_DOWNLOAD_FAILED" });
      expect(String(error)).toContain("https://example.test/report.xlsx");
      expect(String(error)).not.toContain("user:secret");
      expect(String(error)).not.toContain("signature");
      expect(String(error)).not.toContain("private");
      expect(String(error)).not.toContain("fragment");
      expect(await readdir(temporaryRoot)).toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
