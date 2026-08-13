import type { CollabService } from "@univer/collab-gateway";
import { describe, expect, it } from "vitest";
import {
  embeddedUnitIds,
  externalReferenceUnitIds,
  resolveLocalImageAssetsForRender,
} from "../src/features/render/unit-data.js";

describe("render Unit data adapters", () => {
  it("extracts formula references and active embedded Units from persisted resources", () => {
    const unitData = {
      resources: [
        {
          name: "UNIVER_EXTERNAL_REFERENCE_PLUGIN",
          data: JSON.stringify({
            references: {
              a: { sourceUnitId: "sheet-source" },
              b: { sourceUnitId: "base-source" },
              duplicate: { sourceUnitId: "sheet-source" },
            },
          }),
        },
        {
          name: "UNIVER_EMBED_RESOURCE_PLUGIN",
          data: JSON.stringify({
            embeds: {
              active: { childUnitId: "doc-child" },
              resourceRef: { source: { ref: "file.univer#unit=slide-child" } },
              deleted: { childUnitId: "ignored", lifecycle: "soft-deleted" },
            },
          }),
        },
      ],
    };

    expect(externalReferenceUnitIds(unitData)).toEqual(["base-source", "sheet-source"]);
    expect(embeddedUnitIds(unitData)).toEqual(["doc-child", "slide-child"]);
  });

  it("projects scoped UUID image assets to data URIs without mutating saved data", () => {
    const unitData = {
      id: "slide-1",
      pages: {
        page1: {
          elements: {
            image1: { source: "asset-1", imageSourceType: "UUID" },
          },
        },
      },
      resources: [
        {
          name: "serialized-images",
          data: JSON.stringify({ fillImageSource: "asset-1", fillImageSourceType: "UUID" }),
        },
      ],
    };
    const collab = {
      openAsset(assetId: string, worktreeId?: string) {
        expect(assetId).toBe("asset-1");
        expect(worktreeId).toBe("w1");
        return {
          bytes: Uint8Array.from([1, 2, 3]),
          record: { byteSize: 3, mediaType: "image/png" },
        };
      },
    } as unknown as CollabService;

    const rendered = resolveLocalImageAssetsForRender({ collab, unitData, worktreeId: "w1" });
    expect(rendered).not.toBe(unitData);
    expect(
      (rendered["pages"] as Record<string, Record<string, Record<string, unknown>>>)["page1"]?.[
        "elements"
      ]?.["image1"],
    ).toEqual({ source: "data:image/png;base64,AQID", imageSourceType: "BASE64" });
    const serialized = JSON.parse(
      ((rendered["resources"] as Array<Record<string, unknown>>)[0]?.["data"] as string) ?? "{}",
    ) as Record<string, unknown>;
    expect(serialized).toEqual({
      fillImageSource: "data:image/png;base64,AQID",
      fillImageSourceType: "BASE64",
    });
    expect(
      (unitData.pages.page1.elements.image1 as { readonly imageSourceType: string })
        .imageSourceType,
    ).toBe("UUID");
  });
});
