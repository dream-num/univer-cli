import type { WorktreeLifecycleEvent } from "@univer/collab-gateway-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openEventChannel } from "../src/core/events";

class FakeWebSocket {
  public static latest: FakeWebSocket | undefined;

  public onclose: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onopen: (() => void) | null = null;

  public constructor(public readonly url: string) {
    FakeWebSocket.latest = this;
  }

  public close(): void {}

  public receive(event: WorktreeLifecycleEvent): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
  }
}

describe("openEventChannel", () => {
  afterEach(() => {
    FakeWebSocket.latest = undefined;
    vi.unstubAllGlobals();
  });

  it("dispatches Unit catalog name updates", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const received: WorktreeLifecycleEvent[] = [];
    const channel = openEventChannel("/events", {
      unit_updated: (event) => received.push(event)
    });

    FakeWebSocket.latest?.receive({
      type: "unit_updated",
      unitId: "u1",
      name: "Renamed",
      headRev: 2
    });

    expect(received).toEqual([{ type: "unit_updated", unitId: "u1", name: "Renamed", headRev: 2 }]);
    channel.close();
  });
});
