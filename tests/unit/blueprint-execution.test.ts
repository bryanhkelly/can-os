import { describe, expect, it } from "vitest";
import { executeBlueprintConfigurationInputSchema } from "../../src/domain/blueprint-execution";

describe("canonical Blueprint execution input", () => {
  it("requires a frozen configuration decision, target Operation, and bounded idempotency key", () => {
    const input = {
      configurationVersionId: "00000000-0000-4000-8000-000000000001",
      reviewId: "00000000-0000-4000-8000-000000000002",
      operationId: "00000000-0000-4000-8000-000000000003",
      idempotencyKey: "launch-config-v4",
    };
    expect(executeBlueprintConfigurationInputSchema.parse(input)).toEqual(input);
  });

  it("rejects malformed or caller-injected execution authority", () => {
    expect(() => executeBlueprintConfigurationInputSchema.parse({
      configurationVersionId: "invalid",
      reviewId: "00000000-0000-4000-8000-000000000002",
      operationId: "00000000-0000-4000-8000-000000000003",
      idempotencyKey: "launch-config-v4",
    })).toThrow();
    expect(() => executeBlueprintConfigurationInputSchema.parse({
      configurationVersionId: "00000000-0000-4000-8000-000000000001",
      reviewId: "00000000-0000-4000-8000-000000000002",
      operationId: "00000000-0000-4000-8000-000000000003",
      idempotencyKey: "short",
      executionStatus: "authorized",
    })).toThrow();
  });
});
