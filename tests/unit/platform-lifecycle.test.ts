import { describe, expect, it } from "vitest";
import { defineLifecycle, LifecycleError } from "@/platform/lifecycle";

const config = {
  states: ["draft", "published", "archived"] as const,
  transitions: {
    publish: { from: ["draft"], to: "published" },
    archive: { from: ["draft", "published"], to: "archived" },
  },
} as const;

describe("defineLifecycle", () => {
  it("applies valid transitions", () => {
    const lifecycle = defineLifecycle(config);
    expect(lifecycle.apply("draft", "publish")).toBe("published");
    expect(lifecycle.apply("published", "archive")).toBe("archived");
    expect(lifecycle.states).toEqual(["draft", "published", "archived"]);
  });

  it("throws LifecycleError naming state and action for invalid transitions", () => {
    const lifecycle = defineLifecycle(config);
    expect(() => lifecycle.apply("published", "publish")).toThrow(LifecycleError);
    expect(() => lifecycle.apply("archived", "archive")).toThrow(
      /archived.*archive|archive.*archived/,
    );
    try {
      lifecycle.apply("published", "publish");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LifecycleError);
      expect((error as Error).message).toContain("published");
      expect((error as Error).message).toContain("publish");
    }
  });

  it("reports can() false for invalid transitions and true for valid ones", () => {
    const lifecycle = defineLifecycle(config);
    expect(lifecycle.can("draft", "publish")).toBe(true);
    expect(lifecycle.can("draft", "archive")).toBe(true);
    expect(lifecycle.can("published", "publish")).toBe(false);
    expect(lifecycle.can("archived", "publish")).toBe(false);
  });

  it("does not mutate the config when applying transitions", () => {
    const mutableConfig = {
      states: ["draft", "published", "archived"] as const,
      transitions: {
        publish: { from: ["draft"] as readonly ("draft")[], to: "published" as const },
        archive: { from: ["draft", "published"] as readonly ("draft" | "published")[], to: "archived" as const },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(mutableConfig));
    const lifecycle = defineLifecycle(mutableConfig);
    lifecycle.apply("draft", "publish");
    lifecycle.apply("published", "archive");
    expect(lifecycle.can("draft", "archive")).toBe(true);
    expect(JSON.parse(JSON.stringify(mutableConfig))).toEqual(snapshot);
  });
});
