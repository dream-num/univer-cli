import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLang } from "../src/i18n";
import { confirmDialog, escapeHtml } from "../src/ui/dialogs";

describe("collab-web confirmation dialogs", () => {
  beforeEach(async () => {
    await setLang("en-US");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps long chips inside the dialog by allowing their text to wrap", async () => {
    const result = confirmDialog({
      title: "Edit while modifications are still unmerged?",
      body: "Editing may conflict with pending modifications.",
      chips: [
        {
          id: "warning",
          label: "Safer: merge or discard those modifications first, then edit the current version"
        }
      ],
      confirmLabel: "Edit anyway",
      icon: "pencil",
      tone: "warn"
    });

    const chip = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"] [data-slot="badge"]'
    );
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains("min-w-0")).toBe(true);
    expect(chip?.classList.contains("max-w-full")).toBe(true);
    expect(chip?.classList.contains("shrink")).toBe(true);
    expect(chip?.classList.contains("shrink-0")).toBe(false);
    expect(chip?.classList.contains("whitespace-normal")).toBe(true);
    expect(chip?.classList.contains("break-words")).toBe(true);
    expect(chip?.parentElement?.classList.contains("max-h-40")).toBe(true);
    expect(chip?.parentElement?.classList.contains("overflow-y-auto")).toBe(true);
    expect(
      document
        .querySelector<HTMLElement>('[data-slot="dialog-content"]')
        ?.classList.contains("overflow-y-auto")
    ).toBe(true);

    const cancel = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Cancel"
    );
    cancel?.click();
    await expect(result).resolves.toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("renders escaped dynamic text without creating executable elements", async () => {
    const result = confirmDialog({
      title: "Safe HTML",
      body: `Modification: <strong>${escapeHtml('<img src=x onerror="alert(1)">')}</strong>`,
      confirmLabel: "OK"
    });

    expect(document.querySelector('[data-slot="dialog-content"] img')).toBeNull();
    expect(document.querySelector('[data-slot="dialog-content"]')?.textContent).toContain(
      '<img src=x onerror="alert(1)">'
    );
    document.querySelector<HTMLButtonElement>("button")?.click();
    await expect(result).resolves.toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
