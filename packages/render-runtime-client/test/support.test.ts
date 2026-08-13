// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { compositeDomCanvasOverlays } from "../src/support.js";

describe("compositeDomCanvasOverlays", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("maps a Slide Embed canvas from client coordinates into page output pixels", () => {
    const main = document.createElement("canvas");
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue(rect(100, 40, 800, 450));

    const host = document.createElement("div");
    host.setAttribute("data-embed-slides-floating-object-host", "embed-1");
    const embed = document.createElement("canvas");
    embed.width = 800;
    embed.height = 400;
    vi.spyOn(embed, "getBoundingClientRect").mockReturnValue(rect(300, 140, 400, 200));
    host.appendChild(embed);
    document.body.appendChild(host);

    const drawImage = vi.fn();
    compositeDomCanvasOverlays(
      { drawImage },
      { width: 1600, height: 900 },
      main,
      { width: 800, height: 450 },
      { left: 0, top: 0, width: 800, height: 450 },
      "[data-embed-slides-floating-object-host] canvas",
    );

    expect(drawImage).toHaveBeenCalledWith(embed, 0, 0, 800, 400, 400, 200, 800, 400);
  });

  it("clips a Slide Embed canvas at the captured page boundary", () => {
    const main = document.createElement("canvas");
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue(rect(0, 0, 800, 450));

    const host = document.createElement("div");
    host.setAttribute("data-embed-slides-floating-object-host", "embed-1");
    const embed = document.createElement("canvas");
    embed.width = 400;
    embed.height = 200;
    vi.spyOn(embed, "getBoundingClientRect").mockReturnValue(rect(50, 25, 200, 100));
    host.appendChild(embed);
    document.body.appendChild(host);

    const drawImage = vi.fn();
    compositeDomCanvasOverlays(
      { drawImage },
      { width: 800, height: 450 },
      main,
      { width: 800, height: 450 },
      { left: 100, top: 50, width: 400, height: 225 },
      "[data-embed-slides-floating-object-host] canvas",
    );

    expect(drawImage).toHaveBeenCalledWith(embed, 100, 50, 300, 150, 0, 0, 300, 150);
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
