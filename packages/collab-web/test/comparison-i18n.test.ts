import { afterEach, describe, expect, it } from "vitest";
import { CellValueType, HorizontalAlign, WrapStrategy } from "@univerjs/core";
import { LOCALE_MANIFEST, loadMessages, setLang, t } from "../src/i18n/index.js";
import { formatComparisonValue } from "../src/ui/comparison-value.js";

afterEach(async () => { await setLang("en-US"); });

describe("five-product comparison localization", () => {
  it("translates representative five-product paths in every application locale", async () => {
    const representativePaths = [
      "value",
      "formula",
      "style",
      "paragraphStyle",
      "sectionId",
      "tableCells",
      "shapeType",
      "masterPageId",
      "connectorData",
      "fieldOrder",
      "routingMode",
      "geometry",
      "text",
      "title"
    ];
    for (const { tag } of LOCALE_MANIFEST) {
      const messages = await loadMessages(tag);
      for (const key of representativePaths) {
        expect(messages.diff.changePath([key]), `${tag}:${key}`).not.toBe(key);
      }
      if (tag !== "en-US") expect(messages.diff.baseAlignmentHint).not.toContain("stable ID");
    }
  });

  it("translates schema-owned types, operators, formatting and product enums", async () => {
    for (const { tag } of LOCALE_MANIFEST) {
      const { diff } = await loadMessages(tag);
      const cases = [
        ["cell", ["valueType"], CellValueType.NUMBER, "numberType"],
        ["cell", ["valueType"], String(CellValueType.NUMBER), "numberType"],
        ["cell", ["style", "ht"], HorizontalAlign.CENTER, "center"],
        ["cell", ["style", "tb"], WrapStrategy.WRAP, "wrap"],
        ["condition-format", ["rule", "operator"], "between", "between"],
        ["condition-format", ["rule", "type"], "highlightCell", "highlightCell"],
        ["table", ["columns", "0", "dataType"], "string", "textType"],
        ["field", ["type"], "text", "textType"],
        ["view", ["type"], "calendar", "calendar"],
        ["block-range", ["type"], "callout", "callout"],
        ["doc-latex", ["kind"], "inline", "inline"],
        ["slide-transition", ["type"], "wipe", "wipe"],
        ["board-element", ["shapeData", "shapeType"], "rect", "rectangle"],
        ["board-element", ["connectorData", "routingMode"], "manual", "manual"],
      ] as const;
      for (const [entity, path, value, term] of cases) {
        const localized = diff.changeValue(entity, path, value);
        expect(localized, `${tag}:${entity}:${path.join(".")}:${term}`).toBeTruthy();
        expect(localized, `${tag}:${entity}:${path.join(".")}:${term}`).not.toBe(String(value));
      }
    }
  });

  it("renders translated values in Sheet sidebar descriptions without changing content", async () => {
    await setLang("zh-CN");
    expect(formatComparisonValue("2", "unknown", { entityType: "cell", path: ["valueType"] })).toBe("数字");
    expect(formatComparisonValue("between", "text", { entityType: "condition-format", path: ["rule", "operator"] })).toBe("介于");
    expect(t().diff.changePath(["columns", "0", "dataType"])).toBe("列 · 项目 1 · 数据类型");
    expect(t().diff.changePath([])).toBe("项目");
    expect(t().diff.changePath(["futurePluginProperty"])).toBe("其他属性");
    expect(t().diff.changeValue("table", ["columns", "0", "displayName"], "sheets-table.columnPrefix 7")).toBe("第 7 列");
    for (const value of ["between", "rect", "true", "2", "=SUM(A1:A4)", '{"type":"number"}']) {
      expect(formatComparisonValue(value, "text", { entityType: "cell", path: ["value"] })).toBe(value);
      expect(formatComparisonValue(value, "text", { entityType: "record", path: ["type"] })).toBe(value);
      expect(formatComparisonValue(value, "text", { entityType: "paragraph", path: ["text"] })).toBe(value);
      expect(formatComparisonValue(value, "text", { entityType: "field", path: ["name"] })).toBe(value);
    }
    expect(t().diff.changeValue("cell", ["valueType"], 999)).toBeUndefined();
    expect(formatComparisonValue("private-stable-id", "reference", { entityType: "slide", path: ["masterPageId"] })).toBe("private-stable-id");
  });

  it("distinguishes comparison operations, branch identity and Doc structures", async () => {
    for (const { tag } of LOCALE_MANIFEST) {
      const messages = await loadMessages(tag);
      if (tag !== "en-US" && tag !== "zh-CN") {
        expect(messages.diff.sheetTree.titles.deletedRows).toContain(messages.diff.kind.delete);
        expect(messages.diff.sheetTree.titles.insertedRows).toContain(messages.diff.kind.insert);
        expect(messages.topbar.trunk.trim().length).toBeGreaterThan(0);
        expect(messages.topbar.trunk).not.toBe(messages.topbar.currentVersion);
        expect(messages.diff.side.left).not.toBe("left");
        expect(messages.diff.side.right).not.toBe("right");
        expect(messages.diff.revision(8)).toContain("8");
        for (const category of ["doc-code", "doc-quote", "doc-callout", "column-group", "header", "footer"] as const) {
          expect(messages.diff.entity(category)).not.toBe(category);
        }
      }
    }
  });
});
