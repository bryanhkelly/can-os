import { describe, expect, it } from "vitest";
import { defineLifecycle, LifecycleError } from "../../src/platform/lifecycle";

describe("shared lifecycle contract", () => {
  const valid = () => defineLifecycle({
    states: ["draft", "published"] as const,
    transitions: { publish: { from: ["draft"] as const, to: "published" as const } },
  });
  it("permits only declared transitions", () => {
    const lifecycle = valid();
    expect(lifecycle.can("draft", "publish")).toBe(true);
    expect(lifecycle.apply("draft", "publish")).toBe("published");
    expect(() => lifecycle.apply("published", "publish")).toThrow(LifecycleError);
  });
  it("rejects duplicate states", () => {
    expect(() => defineLifecycle({
      states: ["draft", "draft"] as const,
      transitions: { publish: { from: ["draft"] as const, to: "draft" as const } },
    })).toThrow("nonempty and unique");
  });
  it("rejects undeclared targets and sources", () => {
    expect(() => defineLifecycle({
      states: ["draft"] as const,
      transitions: { publish: { from: ["draft"] as const, to: "published" as "draft" } },
    })).toThrow("Invalid lifecycle definition");
    expect(() => defineLifecycle({
      states: ["draft"] as const,
      transitions: { publish: { from: ["other" as "draft"] as const, to: "draft" as const } },
    })).toThrow("Invalid lifecycle definition");
  });
});
