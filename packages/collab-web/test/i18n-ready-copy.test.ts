import { describe, expect, it } from "vitest";
import { loadMessages, LOCALE_MANIFEST } from "../src/i18n";

describe("collab-web ready copy", () => {
  it("provides complete locale-owned ready copy for every supported language", async () => {
    const copies = await Promise.all(
      LOCALE_MANIFEST.map(async ({ tag }) => {
        const messages = await loadMessages(tag);
        const body = messages.modal.readyBody("Demo");
        expect(messages.topbar.submitForReview).not.toContain(" · ");
        expect(messages.modal.readyTitle).not.toContain(" · ");
        expect(messages.modal.readyConfirm).not.toContain(" · ");
        expect(messages.toast.readyFailed("boom")).toContain("boom");
        expect(messages.toast.readyChanged.length).toBeGreaterThan(20);
        expect(body).toContain("Demo");
        expect(body).toContain("<strong>");
        return `${messages.topbar.submitForReview}\n${messages.modal.readyTitle}\n${body}`;
      })
    );

    expect(new Set(copies).size).toBe(LOCALE_MANIFEST.length);
  });

  it("describes ready as an explicit editing gate rather than an automatic draft transition", async () => {
    const english = await loadMessages("en-US");
    const chinese = await loadMessages("zh-CN");

    expect(english.modal.readyBody("Demo")).toContain("explicitly reopen");
    expect(english.modal.readyBody("Demo")).not.toContain("another change");
    expect(chinese.modal.readyBody("Demo")).toContain("显式恢复编辑");
    expect(chinese.modal.readyBody("Demo")).not.toContain("自动回到");
  });
});
