import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollabService } from "../src/collab-service.js";
import {
  UniverfileExistsError,
  UniverfileManager,
  UniverfileNotFoundError
} from "../src/univerfile-manager.js";

describe("UniverfileManager cache coherence on out-of-band deletion", () => {
  let workspace: string;
  let disposed: string[];

  // Fake authority: simulate openDb writing the backing file and record dispose() calls, without
  // booting a real Univer CollabService. The manager only touches collab.dispose() on eviction.
  function createManager(): UniverfileManager {
    disposed = [];
    return new UniverfileManager({
      createCollab: (dbPath: string): CollabService => {
        writeFileSync(dbPath, "");
        return { dispose: () => disposed.push(dbPath) } as unknown as CollabService;
      }
    });
  }

  beforeEach(() => {
    // realpath so paths match the manager's realpath-normalized cache key (macOS /var -> /private/var).
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "univerfile-manager-")));
  });

  afterEach(() => {
    rmSync(workspace, { force: true, recursive: true });
  });

  it("openByPath drops a cached univerfile whose file was deleted on disk", () => {
    const manager = createManager();
    const path = join(workspace, "book.univer");
    manager.createUniverfile(path);
    expect(existsSync(path)).toBe(true);

    rmSync(path);

    expect(() => manager.openByPath(path)).toThrow(UniverfileNotFoundError);
    expect(disposed).toContain(path);
  });

  it("createUniverfile re-creates a path whose file was deleted on disk", () => {
    const manager = createManager();
    const path = join(workspace, "book.univer");
    manager.createUniverfile(path);

    rmSync(path);

    expect(() => manager.createUniverfile(path)).not.toThrow();
    expect(existsSync(path)).toBe(true);
  });

  it("still rejects creating a univerfile that exists on disk", () => {
    const manager = createManager();
    const path = join(workspace, "book.univer");
    manager.createUniverfile(path);

    expect(() => manager.createUniverfile(path)).toThrow(UniverfileExistsError);
  });
});
