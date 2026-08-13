import { beforeEach, describe, expect, it } from "vitest";
import { readLocation, writeLocation } from "../src/core/config";

describe("collab-web URL location", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?file=/tmp/demo.univer");
  });

  it("parses embedded content surface viewer parameters", () => {
    history.replaceState(
      null,
      "",
      "/?file=/tmp/demo.univer&mode=embedded&scope=mergePreview&worktree=wt_1&unit=unit_1&editable=false"
    );

    expect(readLocation()).toEqual({
      univerfile: "/tmp/demo.univer",
      gatewayFileKey: null,
      mode: "embedded",
      scope: "mergePreview",
      worktreeId: "wt_1",
      unitId: "unit_1",
      editable: false
    });
  });

  it("falls back to worktree scope for old embedded worktree URLs", () => {
    history.replaceState(
      null,
      "",
      "/?file=/tmp/demo.univer&mode=embedded&worktree=wt_1&unit=unit_1"
    );

    expect(readLocation()).toEqual({
      univerfile: "/tmp/demo.univer",
      gatewayFileKey: null,
      mode: "embedded",
      scope: "worktree",
      worktreeId: "wt_1",
      unitId: "unit_1",
      editable: null
    });
  });

  it("writes embedded scope and editable state while standalone keeps the old URL shape", () => {
    writeLocation({
      univerfile: "/tmp/demo.univer",
      mode: "embedded",
      scope: "trunk",
      unitId: "unit_1",
      editable: true
    });

    expect(location.search).toBe(
      "?file=%2Ftmp%2Fdemo.univer&mode=embedded&scope=trunk&editable=true&unit=unit_1"
    );

    writeLocation({
      univerfile: "/tmp/demo.univer",
      mode: "standalone",
      scope: "mergePreview",
      worktreeId: "wt_1",
      unitId: "unit_1",
      editable: false
    });

    expect(location.search).toBe("?file=%2Ftmp%2Fdemo.univer&worktree=wt_1&unit=unit_1");
  });

  it("ignores new content parameters when mode is not embedded", () => {
    history.replaceState(
      null,
      "",
      "/?file=/tmp/demo.univer&scope=mergePreview&worktree=wt_1&unit=unit_1&editable=false"
    );

    expect(readLocation()).toEqual({
      univerfile: "/tmp/demo.univer",
      gatewayFileKey: null,
      mode: "standalone",
      scope: "worktree",
      worktreeId: "wt_1",
      unitId: "unit_1",
      editable: null
    });
  });

  it("parses same-origin gateway file keys from file parameters", () => {
    const key = "L3RtcC91bml2ZXItZ2F0ZXdheS1zbW9rZS9idWRnZXQudW5pdmVy";
    history.replaceState(null, "", `/?file=${key}&worktree=wt_1&unit=unit_1`);

    expect(readLocation()).toEqual({
      univerfile: null,
      gatewayFileKey: key,
      mode: "standalone",
      scope: "worktree",
      worktreeId: "wt_1",
      unitId: "unit_1",
      editable: null
    });

    writeLocation({
      univerfile: `http://localhost/uf/${key}`,
      gatewayFileKey: key,
      mode: "standalone",
      worktreeId: "wt_1",
      unitId: "unit_1"
    });

    expect(location.search).toBe(`?file=${key}&worktree=wt_1&unit=unit_1`);
  });
});
