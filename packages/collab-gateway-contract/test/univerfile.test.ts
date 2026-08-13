import { describe, expect, it } from "vitest";
import { decodeUniverfile, encodeUniverfile } from "../src/univerfile.js";

describe("encodeUniverfile", () => {
  // 已知答案向量。服务端用 Node 的 Buffer.from(enc, "base64url") 反解;
  // 标准 base64url 可互操作,故此处用纯 web API 编出的值与之一致。
  it("encodes a known path to standard base64url", () => {
    expect(encodeUniverfile("/Users/me/book.univer")).toBe("L1VzZXJzL21lL2Jvb2sudW5pdmVy");
  });

  it("is url-safe (no +, /, or = padding)", () => {
    const enc = encodeUniverfile("/tmp/~测试 空格/book.univer");
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("round-trips through decodeUniverfile (incl. non-ASCII)", () => {
    for (const path of ["/Users/me/book.univer", "/tmp/中文 路径/数据表.univer", "/a/b/c.univer"]) {
      expect(decodeUniverfile(encodeUniverfile(path))).toBe(path);
    }
  });
});
