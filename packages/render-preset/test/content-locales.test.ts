import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_LOCALES, loadContentLocale } from "../src/locales/generated/load.js";

describe("content locale composition", () => {
  it("includes the Design calendar locale in both viewer language packs", async () => {
    const enUS = await readFile(
      resolve(import.meta.dirname, "../src/locales/generated/en-US.ts"),
      "utf8"
    );
    const zhCN = await readFile(
      resolve(import.meta.dirname, "../src/locales/generated/zh-CN.ts"),
      "utf8"
    );

    expect(enUS).toContain('from "@univerjs/design/locale/en-US"');
    expect(zhCN).toContain('from "@univerjs/design/locale/zh-CN"');
  });

  it("exposes the shared Chart UI translations in every viewer language pack", async () => {
    for (const locale of CONTENT_LOCALES) {
      const source = await readFile(
        resolve(import.meta.dirname, `../src/locales/generated/${locale}.ts`),
        "utf8"
      );
      expect(source).toContain(`from "@univerjs-pro/chart-ui/locale/${locale}"`);
    }

    const zhCN = await loadContentLocale("zh-CN");
    expect(zhCN).toHaveProperty(["chart-ui", "presentation", "backgroundColor"], "背景颜色");
    expect(zhCN).toHaveProperty(["chart-ui", "editor", "defaultColor"], "默认颜色");
    expect(zhCN).toHaveProperty(["chart-ui", "common", "borderColor"], "边框颜色");
    expect(zhCN).toHaveProperty(["chart-ui", "plotArea", "label"], "绘图区");
    expect(zhCN).toHaveProperty(["chart-ui", "common", "mode"], "模式");
    expect(zhCN).toHaveProperty(["chart-ui", "common", "auto"], "自动");
  });

  it("exposes the Engine Chart translations in every viewer language pack", async () => {
    for (const locale of CONTENT_LOCALES) {
      const source = await readFile(
        resolve(import.meta.dirname, `../src/locales/generated/${locale}.ts`),
        "utf8"
      );
      expect(source).toContain(`from "@univerjs-pro/engine-chart/locale/${locale}"`);
    }

    const zhCN = await loadContentLocale("zh-CN");
    expect(zhCN).toHaveProperty(["engine-chart", "seriesDefaultName"], "系列 {0}");
    expect(zhCN).toHaveProperty(
      ["engine-chart", "bubbleEmptyTips"],
      "气泡图至少需要2列，X轴、Y轴。"
    );
    expect(zhCN).toHaveProperty(["engine-chart", "msgEmptyTips"], "请先添加系列开始数据可视化");
  });
});
