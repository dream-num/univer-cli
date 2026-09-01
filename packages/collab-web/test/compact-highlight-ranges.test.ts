import { describe, expect, it } from "vitest";
import { compactHighlightRanges } from "../src/ui/compact-highlight-ranges.js";

describe("compactHighlightRanges", () => {
  it("merges a cell grid into one exact rectangle", () => {
    expect(
      compactHighlightRanges([
        { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
        { startRow: 0, endRow: 0, startColumn: 1, endColumn: 1 },
        { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
        { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 }
      ])
    ).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
  });

  it("removes duplicates and ranges already covered by a larger range", () => {
    expect(
      compactHighlightRanges([
        { startRow: 2, endRow: 4, startColumn: 3, endColumn: 5 },
        { startRow: 3, endRow: 3, startColumn: 4, endColumn: 4 },
        { startRow: 2, endRow: 4, startColumn: 3, endColumn: 5 }
      ])
    ).toEqual([{ startRow: 2, endRow: 4, startColumn: 3, endColumn: 5 }]);
  });

  it("keeps diagonal and L-shaped coverage separate", () => {
    expect(
      compactHighlightRanges([
        { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
        { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
        { startRow: 2, endRow: 2, startColumn: 2, endColumn: 2 }
      ])
    ).toEqual([
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
      { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
      { startRow: 2, endRow: 2, startColumn: 2, endColumn: 2 }
    ]);
  });

  it("merges transitively across rows and columns", () => {
    expect(
      compactHighlightRanges([
        { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
        { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
        { startRow: 0, endRow: 1, startColumn: 1, endColumn: 1 }
      ])
    ).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }]);
  });

  it("preserves exact cell coverage across mixed overlapping ranges", () => {
    let seed = 17;
    const random = (max: number): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed % max;
    };

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const ranges = Array.from({ length: 24 }, () => {
        const startRow = random(8);
        const startColumn = random(8);
        return {
          startRow,
          endRow: startRow + random(8 - startRow),
          startColumn,
          endColumn: startColumn + random(8 - startColumn)
        };
      });

      expect(cellsCoveredBy(compactHighlightRanges(ranges))).toEqual(cellsCoveredBy(ranges));
    }
  });
});

function cellsCoveredBy(
  ranges: readonly {
    readonly startRow: number;
    readonly endRow: number;
    readonly startColumn: number;
    readonly endColumn: number;
  }[]
): string[] {
  const cells = new Set<string>();
  for (const range of ranges) {
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        cells.add(`${row}:${column}`);
      }
    }
  }
  return [...cells].sort();
}
