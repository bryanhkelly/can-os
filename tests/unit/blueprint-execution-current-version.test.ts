import { describe, expect, it } from "vitest";
import { assertCurrentBlueprintExecutionVersion } from "@/domain/blueprint-execution";

describe("canonical Blueprint execution approval currency", () => {
  const approved = "11111111-1111-4111-8111-111111111111";
  const supersedingDraft = "22222222-2222-4222-8222-222222222222";

  it("accepts the latest frozen configuration version", () => {
    expect(() => assertCurrentBlueprintExecutionVersion(approved, approved))
      .not.toThrow();
  });

  it("rejects executing a previously approved version after a newer draft is saved", () => {
    expect(() => assertCurrentBlueprintExecutionVersion(approved, supersedingDraft))
      .toThrow(/revised.*latest version/i);
  });

  it("fails closed if the latest version could not be resolved", () => {
    expect(() => assertCurrentBlueprintExecutionVersion(approved, null))
      .toThrow(/revised.*latest version/i);
  });
});
