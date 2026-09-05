/**
 * jsdom lacks a few layout/animation APIs that Base UI and floating-ui reach for when
 * positioning popups or measuring transitions. Stub them so component tests stay headless.
 */

// Pure model tests use Node; browser shims belong only to the jsdom environment.
if (typeof window !== "undefined") {
  class ResizeObserverStub {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  }

  if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }

  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel: () => undefined,
      finish: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })) as unknown as Element["animate"];
  }

  /**
   * jsdom's HTMLElement.click() only dispatches `click`, but real presses fire
   * pointerdown → mousedown → pointerup → mouseup → click, and Base UI triggers
   * open on mousedown (the follow-up click is ignored only when a pointerdown
   * recorded the pointer type first). Mirror the real sequence so tests keep
   * driving the UI through plain `.click()` calls.
   */
  const nativeClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function click(this: HTMLElement): void {
    if (this.isConnected) {
      const init: MouseEventInit = { bubbles: true, cancelable: true, composed: true };
      const pointerDown = new MouseEvent("pointerdown", init);
      Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });
      this.dispatchEvent(pointerDown);
      this.dispatchEvent(new MouseEvent("mousedown", init));
      const pointerUp = new MouseEvent("pointerup", init);
      Object.defineProperty(pointerUp, "pointerType", { value: "mouse" });
      this.dispatchEvent(pointerUp);
      this.dispatchEvent(new MouseEvent("mouseup", init));
    }
    nativeClick.call(this);
  };
}
