import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The development runner is a Node.js maintenance script.
import {
  addSdkOverrides,
  assertCompiledSdkEntry,
  captureInstalledLock,
  replaceOwnedConfiguration,
  restoreOwnedFile,
} from "../scripts/dev/verify-board.mjs";

describe("local Board SDK development workflow", () => {
  it("never adopts a workspace edit made during the install", () => {
    const directory = mkdtempSync(join(tmpdir(), "univer-board-dev-concurrent-"));
    const workspace = {
      path: join(directory, "workspace.yaml"),
      owned: Buffer.from("original workspace\n"),
    };
    const lock = { path: join(directory, "lock.yaml"), owned: Buffer.from("original lock\n") };
    try {
      writeFileSync(workspace.path, workspace.owned);
      writeFileSync(lock.path, lock.owned);
      const expected = Buffer.from("temporary SDK overrides\n");
      replaceOwnedConfiguration(workspace, expected);
      writeFileSync(lock.path, "installer lock\n");
      writeFileSync(workspace.path, "concurrent workspace edit\n");
      expect(() => captureInstalledLock(workspace, lock)).toThrow(/Concurrent edit preserved/u);
      expect(workspace.owned).toEqual(expected);
      expect(lock.owned).toEqual(Buffer.from("installer lock\n"));
      expect(() =>
        restoreOwnedFile(workspace.path, Buffer.from("original workspace\n"), workspace.owned),
      ).toThrow(/Concurrent/u);
      expect(readFileSync(workspace.path, "utf8")).toBe("concurrent workspace edit\n");
      expect(() => replaceOwnedConfiguration(workspace, Buffer.from("another override\n"))).toThrow(
        /Concurrent/u,
      );
      expect(readFileSync(workspace.path, "utf8")).toBe("concurrent workspace edit\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects packed source entrypoints even when the archive has a valid SDK name", () => {
    expect(() =>
      assertCompiledSdkEntry({ name: "@univerjs-pro/boards", exports: { ".": "./src/index.ts" } }),
    ).toThrow(/compiled SDK/u);
    expect(() =>
      assertCompiledSdkEntry({
        name: "@univer-cli/unit-layout-lint",
        exports: { ".": { import: "./dist/index.mjs", types: "./dist/index.d.ts" } },
      }),
    ).not.toThrow();
  });
  it("preserves existing workspace settings while adding only SDK tarballs", () => {
    const source =
      'packages:\n  - "apps/*"\noverrides:\n  react: 19.3.0\nallowBuilds:\n  esbuild: true\n';
    const result = addSdkOverrides(source, {
      "@univerjs-pro/boards": "C:\\dev packages\\boards.tgz",
    });
    expect(result).toContain('  "@univerjs-pro/boards": "file:C:/dev packages/boards.tgz"');
    expect(result).toContain("  react: 19.3.0\nallowBuilds:\n  esbuild: true");
    expect(() => addSdkOverrides(source, { "@univer/private-app": "app.tgz" })).toThrow(
      /public SDK/u,
    );
    expect(() =>
      addSdkOverrides("overrides: {}\n", { "@univer-cli/unit-layout-lint": "lint.tgz" }),
    ).toThrow(/block-style/u);
  });

  it("restores exact original bytes after failure without overwriting concurrent edits", () => {
    const directory = mkdtempSync(join(tmpdir(), "univer-board-dev-restore-"));
    const file = join(directory, "workspace.yaml");
    const original = Buffer.from("packages:\r\n  - apps/*\r\n");
    const temporary = Buffer.from("packages:\n  - apps/*\noverrides:\n");
    try {
      writeFileSync(file, temporary);
      try {
        throw new Error("Install failed");
      } catch {
        restoreOwnedFile(file, original, temporary);
      }
      expect(readFileSync(file)).toEqual(original);
      writeFileSync(file, "another developer's edit\n");
      expect(() => restoreOwnedFile(file, original, temporary)).toThrow(
        /Concurrent edit preserved/u,
      );
      expect(readFileSync(file, "utf8")).toBe("another developer's edit\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
