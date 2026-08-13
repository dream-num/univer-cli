/**
 * 文本几何的单测:骨架数据 → 两个框。
 *
 * fixture 取自**真实渲染器**的骨架(用探针从渲染 runtime 里抓出来的数值,见每个用例的注释),
 * 而不是手编的理想值——手编 fixture 只能证明代码算得对它自己,证明不了它与渲染器一致。
 */
import { describe, expect, it } from "vitest";
import { textGeometryOf, type SkeletonData } from "../src/text-geometry.js";

type Pages = NonNullable<SkeletonData["pages"]>;

/** 造一条行:24px 字、行盒 44、基线距顶 29。 */
function line(input: {
  top: number;
  paddingLeft?: number;
  glyphs: Array<{ content: string; left: number; width: number; aba?: number; abd?: number }>;
}): Pages {
  const runWidth = input.glyphs.reduce((sum, glyph) => sum + glyph.width, 0);
  return [
    {
      sections: [
        {
          columns: [
            {
              lines: [
                {
                  top: input.top,
                  lineHeight: 44,
                  asc: 29,
                  divides: [
                    {
                      left: 0,
                      paddingLeft: input.paddingLeft ?? 0,
                      glyphGroupWidth: runWidth,
                      glyphGroup: input.glyphs.map((glyph) => ({
                        content: glyph.content,
                        left: glyph.left,
                        width: glyph.width,
                        bBox: { aba: glyph.aba ?? 22.9, abd: glyph.abd ?? 0, ba: 29, bd: 7 },
                      })),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/** 从单行 fixture 里取出那一行(拼多行用)。 */
function linesOfPages(pages: Pages) {
  return pages.flatMap((page) =>
    (page.sections ?? []).flatMap((section) =>
      (section.columns ?? []).flatMap((column) => column.lines ?? []),
    ),
  );
}

const NO_INSET = { left: 0, top: 0, right: 0, bottom: 0 };

describe("textGeometryOf", () => {
  it("占位框是行盒,墨迹框是字形——两者不同,且都不是猜的", () => {
    // 单行文本:行盒 44 高,而这几个字形只落墨 22.9 高(W 没有下伸部分)。
    const geometry = textGeometryOf({
      skeleton: { pages: line({ top: 0, glyphs: [{ content: "W", left: 0, width: 30 }] }) },
      verticalOffset: 0,
      declared: { left: 100, top: 200, width: 400, height: 100 },
      inset: NO_INSET,
      angle: 0,
    });

    expect(geometry?.box).toEqual({ left: 100, top: 200, width: 30, height: 44 });
    // 墨迹:基线在 top+29,字形上伸 22.9、下伸 0
    expect(geometry?.ink).toEqual({ left: 100, top: 200 + 29 - 22.9, width: 30, height: 22.9 });
    expect(geometry?.lineCount).toBe(1);
  });

  it("水平对齐直接读 divide.paddingLeft,不按对齐重算位置", () => {
    // 真实数值:500 宽的框、居中,渲染器把 paddingLeft 记成 186.87(=(500-126.3)/2)。
    const geometry = textGeometryOf({
      skeleton: {
        pages: line({
          top: 0,
          paddingLeft: 186.87,
          glyphs: [{ content: "A", left: 0, width: 126.3 }],
        }),
      },
      verticalOffset: 0,
      declared: { left: 660, top: 60, width: 500, height: 200 },
      inset: NO_INSET,
      angle: 0,
    });

    expect(geometry?.box.left).toBeCloseTo(660 + 186.87, 2);
    expect(geometry?.ink.left).toBeCloseTo(660 + 186.87, 2);
  });

  it("垂直对齐直接读渲染缓存的 marginTop", () => {
    // 真实数值:200 高的框、垂直居中、内容 44 → 渲染器记 marginTop = 78。
    const geometry = textGeometryOf({
      skeleton: { pages: line({ top: 0, glyphs: [{ content: "A", left: 0, width: 60 }] }) },
      verticalOffset: 78,
      declared: { left: 0, top: 60, width: 500, height: 200 },
      inset: NO_INSET,
      angle: 0,
    });

    expect(geometry?.box.top).toBe(60 + 78);
    expect(geometry?.ink.top).toBeCloseTo(60 + 78 + 29 - 22.9, 5);
  });

  it("折行文本:行数与每行位置照抄骨架,不重排", () => {
    const pages: Pages = [
      {
        sections: [
          {
            columns: [
              {
                lines: [
                  ...linesOfPages(
                    line({ top: 0, glyphs: [{ content: "a", left: 0, width: 300 }] }),
                  ),
                  ...linesOfPages(
                    line({ top: 44, glyphs: [{ content: "b", left: 0, width: 260 }] }),
                  ),
                  ...linesOfPages(
                    line({ top: 88, glyphs: [{ content: "c", left: 0, width: 180 }] }),
                  ),
                ],
              },
            ],
          },
        ],
      },
    ];

    const geometry = textGeometryOf({
      skeleton: { pages },
      verticalOffset: 0,
      declared: { left: 120, top: 160, width: 420, height: 260 },
      inset: NO_INSET,
      angle: 0,
    });

    expect(geometry?.lineCount).toBe(3);
    // 占位框:最宽那行的推进宽 × 三个行盒
    expect(geometry?.box).toEqual({ left: 120, top: 160, width: 300, height: 132 });
    // 墨迹框:比占位框矮一截(行距留白不算墨)
    expect(geometry?.ink.height).toBeCloseTo(88 + 29 + 0 - (29 - 22.9), 5);
    expect(geometry?.ink.height).toBeLessThan(geometry!.box.height);
  });

  it("尾随空格进占位框但不进墨迹框(纯推进、零墨迹)", () => {
    const geometry = textGeometryOf({
      skeleton: {
        pages: line({
          top: 0,
          glyphs: [
            { content: "A", left: 0, width: 30 },
            { content: " ", left: 30, width: 20, aba: 0, abd: 0 },
          ],
        }),
      },
      verticalOffset: 0,
      declared: { left: 0, top: 0, width: 200, height: 60 },
      inset: NO_INSET,
      angle: 0,
    });

    expect(geometry?.box.width).toBe(50); // 含空格的推进宽
    expect(geometry?.ink.width).toBe(30); // 空格不落墨
  });

  it("内边距把原点右下移", () => {
    const geometry = textGeometryOf({
      skeleton: { pages: line({ top: 0, glyphs: [{ content: "A", left: 0, width: 30 }] }) },
      verticalOffset: 0,
      declared: { left: 100, top: 100, width: 200, height: 60 },
      inset: { left: 4, top: 2, right: 4, bottom: 2 },
      angle: 0,
    });

    expect(geometry?.box.left).toBe(104);
    expect(geometry?.box.top).toBe(102);
  });

  it("旋转:两个框都绕元素中心转后取轴对齐包围盒", () => {
    const geometry = textGeometryOf({
      skeleton: { pages: line({ top: 0, glyphs: [{ content: "A", left: 0, width: 100 }] }) },
      verticalOffset: 0,
      declared: { left: 0, top: 0, width: 200, height: 100 },
      inset: NO_INSET,
      angle: 90,
    });

    // 90 度:100×44 的框转成 44×100
    expect(geometry?.box.width).toBeCloseTo(44, 5);
    expect(geometry?.box.height).toBeCloseTo(100, 5);
  });

  it("骨架缺 glyphGroupWidth 时按字形宽求和(否则占位框静默塌成零宽)", () => {
    const pages: Pages = [
      {
        sections: [
          {
            columns: [
              {
                lines: [
                  {
                    top: 0,
                    lineHeight: 44,
                    asc: 29,
                    divides: [
                      {
                        left: 0,
                        paddingLeft: 0,
                        // glyphGroupWidth 故意缺失
                        glyphGroup: [
                          { content: "A", left: 0, width: 30, bBox: { aba: 22.9, abd: 0 } },
                          { content: "B", left: 30, width: 25, bBox: { aba: 22.9, abd: 0 } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const geometry = textGeometryOf({
      skeleton: { pages },
      verticalOffset: 0,
      declared: { left: 0, top: 0, width: 200, height: 60 },
      inset: NO_INSET,
      angle: 0,
    });
    expect(geometry?.box.width).toBe(55);
  });

  it("骨架缺 asc 时按字形声明的最大上伸定基线(否则墨迹凭空上移一整行)", () => {
    const pages: Pages = [
      {
        sections: [
          {
            columns: [
              {
                lines: [
                  {
                    top: 0,
                    lineHeight: 44,
                    // asc 故意缺失
                    divides: [
                      {
                        left: 0,
                        paddingLeft: 0,
                        glyphGroupWidth: 30,
                        glyphGroup: [
                          {
                            content: "A",
                            left: 0,
                            width: 30,
                            bBox: { ba: 29, bd: 7, aba: 22.9, abd: 0 },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const geometry = textGeometryOf({
      skeleton: { pages },
      verticalOffset: 0,
      declared: { left: 0, top: 100, width: 200, height: 60 },
      inset: NO_INSET,
      angle: 0,
    });
    // 基线 = 顶 + 29(字形声明上伸);墨迹上沿 = 基线 − 22.9
    expect(geometry?.ink.top).toBeCloseTo(100 + 29 - 22.9, 5);
  });

  it("骨架为空时返回 undefined(交给调用方降级,不谎报一个框)", () => {
    expect(
      textGeometryOf({
        skeleton: { pages: [] },
        verticalOffset: 0,
        declared: { left: 0, top: 0, width: 10, height: 10 },
        inset: NO_INSET,
        angle: 0,
      }),
    ).toBeUndefined();
  });
});
