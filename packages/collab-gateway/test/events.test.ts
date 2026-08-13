import type { WorktreeLifecycleEvent } from "@univer/collab-gateway-contract";
import { describe, expect, it } from "vitest";
import { EventHub } from "../src/transport/events.js";

function collector(): {
  conn: { write: (e: WorktreeLifecycleEvent) => void };
  events: WorktreeLifecycleEvent[];
} {
  const events: WorktreeLifecycleEvent[] = [];
  return { conn: { write: (e: WorktreeLifecycleEvent) => events.push(e) }, events };
}

const aWorktree = {
  worktreeId: "f1",
  status: "draft" as const,
  agentId: "",
  name: "",
  baseline: {},
  createdAt: "t"
};

describe("EventHub (lifecycle event channels)", () => {
  it("delivers structured events to channel subscribers", () => {
    const hub = new EventHub();
    const ws = collector();
    hub.subscribe("", ws.conn);
    hub.emit("", { type: "worktree", worktree: aWorktree });
    expect(ws.events).toHaveLength(1);
    expect(ws.events[0]).toEqual({ type: "worktree", worktree: aWorktree });
  });

  it("isolates the univerfile channel from a worktree channel", () => {
    const hub = new EventHub();
    const ws = collector();
    const fk = collector();
    hub.subscribe("", ws.conn);
    hub.subscribe("f1", fk.conn);
    hub.emit("f1", { type: "reset", worktreeId: "f1" });
    expect(fk.events).toHaveLength(1);
    expect(fk.events[0]!.type).toBe("reset");
    expect(ws.events).toHaveLength(0);
  });

  it("delivers Unit catalog name updates", () => {
    const hub = new EventHub();
    const ws = collector();
    hub.subscribe("", ws.conn);
    hub.emit("", { type: "unit_updated", unitId: "u1", name: "Renamed", headRev: 2 });
    expect(ws.events).toEqual([
      { type: "unit_updated", unitId: "u1", name: "Renamed", headRev: 2 }
    ]);
  });

  it("stops delivering after unsubscribe", () => {
    const hub = new EventHub();
    const ws = collector();
    const off = hub.subscribe("", ws.conn);
    off();
    hub.emit("", { type: "unit_removed", unitId: "u1" });
    expect(ws.events).toHaveLength(0);
    expect(hub.hasConnections()).toBe(false);
  });
});
