import { describe, expect, it } from "vitest";
import { UNIVER_LICENSE } from "../apps/cli/src/license.ts";
import { TEST_LICENSE } from "../packages/render-preset/src/license.ts";

describe("Univer runtime development license", () => {
  it("keeps the browser License in step with the Node one", () => {
    expect(TEST_LICENSE).toBe(UNIVER_LICENSE);
  });
});
