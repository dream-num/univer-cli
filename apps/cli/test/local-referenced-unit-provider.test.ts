import type { SnapshotService } from "@univerjs-pro/collaboration";
import type { IEmbedResourceRefEnsureUnitInput } from "@univerjs-pro/embed";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it, vi } from "vitest";
import { createLocalReferencedUnitProviderRegistration } from "../src/runtime/local-referenced-unit-provider.js";

describe("Local referenced Unit provider", () => {
  it("loads a same-Univerfile Unit and preserves the Embed child create options", async () => {
    const loadSheet = vi.fn(async () => ({
      getUnitId: () => "sheet-child",
      type: UniverInstanceType.UNIVER_SHEET,
    }));
    const createOptions = { makeCurrent: false };
    const registration = createLocalReferencedUnitProviderRegistration({
      resolveSnapshotService: () =>
        ({ loadSheet }) as unknown as Pick<
          SnapshotService,
          "loadBase" | "loadBoard" | "loadDoc" | "loadSheet" | "loadSlide"
        >,
    });

    await expect(
      registration.provider.ensureUnit({
        createOptions,
        ref: { file: { kind: "self" }, unit: { selector: "sheet-child", type: "sheet" } },
        unitType: UniverInstanceType.UNIVER_SHEET,
      }),
    ).resolves.toEqual({
      unitId: "sheet-child",
      unitType: UniverInstanceType.UNIVER_SHEET,
    });
    expect(loadSheet).toHaveBeenCalledWith("sheet-child", 0, undefined, { createOptions });
  });

  it("rejects a ResourceRef whose declared type differs from the requested Unit type", async () => {
    const loadSheet = vi.fn();
    const registration = createLocalReferencedUnitProviderRegistration({
      resolveSnapshotService: () => ({ loadSheet }) as unknown as SnapshotService,
    });
    const input: IEmbedResourceRefEnsureUnitInput = {
      createOptions: {},
      ref: { file: { kind: "self" }, unit: { selector: "child", type: "doc" } },
      unitType: UniverInstanceType.UNIVER_SHEET,
    };

    await expect(registration.provider.ensureUnit(input)).rejects.toMatchObject({
      code: "LOCAL_RUNTIME_RESOURCE_REF_UNIT_TYPE_MISMATCH",
    });
    expect(loadSheet).not.toHaveBeenCalled();
  });
});
