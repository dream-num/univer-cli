import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE
} from "@univer/collab-gateway-contract";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UnitIcon } from "../src/ui/unit-icon";

describe("Gateway unit product icons", () => {
  it.each([
    [UNIT_TYPE_DOC, "docs-multi-icon"],
    [UNIT_TYPE_SHEET, "sheets-multi-icon"],
    [UNIT_TYPE_SLIDE, "slides-multi-icon"],
    [UNIT_TYPE_BASE, "bases-multi-icon"],
    [UNIT_TYPE_BOARD, "boards-multi-icon"]
  ])("maps unit type %s to official %s", (type, iconId) => {
    expect(renderToStaticMarkup(<UnitIcon type={type} />)).toContain(`univerjs-icon-${iconId}`);
  });
});
