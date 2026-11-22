import { describe, expect, it } from "vitest";
import { registerUniqueDomainEventHandler } from "@/domain/domain-event-handler-registry";

describe("unique operational event handlers", () => {
  it("registers distinct events without changing ownership", () => {
    const registry = new Map<string, () => Promise<void>>();
    const first = async () => {};
    const second = async () => {};
    registerUniqueDomainEventHandler(registry, "SourceUpdated", first);
    registerUniqueDomainEventHandler(registry, "ClassChanged", second);
    expect(registry.get("SourceUpdated")).toBe(first);
    expect(registry.get("ClassChanged")).toBe(second);
  });

  it("rejects silent replacement of existing consumers", () => {
    const registry = new Map<string, () => Promise<void>>();
    const notify = async () => {};
    const project = async () => {};
    registerUniqueDomainEventHandler(registry, "InterestEventCreated", notify);
    expect(() => registerUniqueDomainEventHandler(
      registry, "InterestEventCreated", project,
    )).toThrow("Duplicate domain event handler registration");
    expect(registry.get("InterestEventCreated")).toBe(notify);
  });

  it("rejects blank event types", () => {
    expect(() => registerUniqueDomainEventHandler(new Map<string, number>(), " ", 1))
      .toThrow("nonempty event type");
  });
});
