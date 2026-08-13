/**
 * 机器页面入口:装配无头 Univer(与人类查看器共享 @univer/render-preset 的内容插件预设,
 * 无协同/无网络),暴露 window.__univerRenderRuntime 供 daemon 宿主 page.evaluate 调用。
 * 失败约定见 support.ts codedError:reject message 以错误码前缀开头。
 */
import "@univer/render-preset/styles";
import "@univer/render-preset/facades";

import { LocaleType, Univer } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { TEST_LICENSE, ViewAssetIoOwner, registerViewRendering } from "@univer/render-preset";
import { CONTENT_EN_US } from "@univer/render-preset/machine-locale";
import {
  UnitRegistry,
  type RenderFormulaReferenceUnitSourceWire,
  type RenderEmbeddedUnitSourceWire,
  type RenderUnitTypeWire,
} from "./units.js";
import { measureText, type MeasureTextResult } from "./measure.js";
import { captureSlideLayout, renderSlidePage, type SlideLayoutCaptureResult } from "./slide-ops.js";
import {
  captureSheetLayout,
  renderSheetRange,
  type SheetLayoutCaptureResult,
} from "./sheet-ops.js";
import { captureDocLayout, renderDocPage, type DocLayoutCaptureResult } from "./doc-ops.js";
import { composeContactSheet } from "./compose.js";
import {
  renderBoardContent,
  type BoardContentRenderOptions,
  type BoardContentRenderResult,
} from "./board-ops.js";
import { prepareBaseView, type BaseViewCapturePreparation } from "./base-ops.js";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: CONTENT_EN_US },
});

registerViewRendering(univer, {
  container: "app",
  assetIoOwner: ViewAssetIoOwner.Local,
  license: TEST_LICENSE,
  workbenchChrome: "visible",
});

const registry = new UnitRegistry(univer);
const univerAPI = FUniver.newAPI(univer);

interface RenderRuntimePageApi {
  readonly ready: true;
  loadUnit(input: {
    unitKey: string;
    unitType: RenderUnitTypeWire;
    unitData: Record<string, unknown>;
    formulaReferenceUnits?: readonly RenderFormulaReferenceUnitSourceWire[];
    embeddedUnits?: readonly RenderEmbeddedUnitSourceWire[];
  }): Promise<{ unitKey: string; loaded: true }>;
  getSession(unitKey: string): { unitKey: string; loaded: boolean } | null;
  disposeUnit(unitKey: string): void;
  measureText(input: {
    doc: Record<string, unknown>;
    wrapWidth?: number;
  }): Promise<MeasureTextResult>;
  captureSlideLayout(input: {
    unitKey: string;
    pages?: readonly number[];
  }): Promise<SlideLayoutCaptureResult>;
  captureSheetLayout(input: {
    unitKey: string;
    range?: string;
    sheetName?: string;
  }): Promise<SheetLayoutCaptureResult>;
  captureDocLayout(input: {
    unitKey: string;
    pages?: readonly number[];
  }): Promise<DocLayoutCaptureResult>;
  renderSlidePage(input: {
    unitKey: string;
    page: number;
    scale?: number;
  }): Promise<{ dataUrl: string; width: number; height: number }>;
  renderSheetRange(input: {
    unitKey: string;
    range: string;
    sheetName?: string;
    scale?: number;
  }): Promise<{ dataUrl: string; width: number; height: number }>;
  renderDocPage(input: {
    unitKey: string;
    page: number;
    scale?: number;
  }): Promise<{ dataUrl: string; width: number; height: number }>;
  prepareBaseView(input: { unitKey: string }): Promise<BaseViewCapturePreparation>;
  renderBoardContent(
    input: { unitKey: string } & BoardContentRenderOptions,
  ): Promise<BoardContentRenderResult>;
  composeContactSheet(input: {
    images: readonly { page: number; dataUrl: string }[];
    tile?: { columns: number; rows: number };
  }): Promise<{ dataUrl: string; width: number; height: number }>;
}

declare global {
  interface Window {
    __univerRenderRuntime: RenderRuntimePageApi;
  }
}

window.__univerRenderRuntime = {
  ready: true,
  loadUnit: (input) => registry.load(input),
  getSession: (unitKey) => registry.getSession(unitKey),
  disposeUnit: (unitKey) => registry.disposeUnit(unitKey),
  measureText: async (input) => measureText(univer, input),
  captureSlideLayout: (input) =>
    captureSlideLayout(univer, registry.require(input.unitKey), input.pages),
  captureSheetLayout: (input) =>
    captureSheetLayout(univer, registry.require(input.unitKey), {
      ...(input.range === undefined ? {} : { range: input.range }),
      ...(input.sheetName === undefined ? {} : { sheetName: input.sheetName }),
    }),
  captureDocLayout: (input) =>
    captureDocLayout(univer, registry.require(input.unitKey), input.pages),
  renderSlidePage: (input) =>
    renderSlidePage(univer, registry.require(input.unitKey), input.page, input.scale ?? 1),
  renderSheetRange: (input) =>
    renderSheetRange(univer, registry.require(input.unitKey), {
      range: input.range,
      ...(input.sheetName === undefined ? {} : { sheetName: input.sheetName }),
      ...(input.scale === undefined ? {} : { scale: input.scale }),
    }),
  renderDocPage: (input) =>
    renderDocPage(univer, registry.require(input.unitKey), input.page, input.scale ?? 1),
  prepareBaseView: (input) => prepareBaseView(univer, univerAPI, registry.require(input.unitKey)),
  renderBoardContent: (input) =>
    renderBoardContent(univerAPI, registry.require(input.unitKey), {
      ...(input.region === undefined ? {} : { region: input.region }),
      ...(input.elementIds === undefined ? {} : { elementIds: input.elementIds }),
      ...(input.padding === undefined ? {} : { padding: input.padding }),
      ...(input.scale === undefined ? {} : { scale: input.scale }),
    }),
  composeContactSheet: (input) => composeContactSheet(input),
};
