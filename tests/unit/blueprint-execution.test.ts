import { describe, expect, it } from "vitest";
import { blueprintDeploymentCode, executeBlueprintConfigurationInputSchema } from "../../src/domain/blueprint-execution";

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

  it("creates deterministic codes for the same approved configuration", () => {
    const argumentsForDeployment = [
      "After School Community",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ] as const;
    const code = blueprintDeploymentCode(...argumentsForDeployment);
    expect(code).toBe(blueprintDeploymentCode(...argumentsForDeployment));
    expect(code.startsWith("bp-after-school-community-")).toBe(true);
    expect(code.length).toBeLessThanOrEqual(68);
  });

  it("does not collide when separate configurations adopt the same Offering", () => {
    const componentId = "00000000-0000-4000-8000-000000000002";
    const offeringVersionId = "00000000-0000-4000-8000-000000000003";
    const first = blueprintDeploymentCode(
      "after-school", "11111111-0000-4000-8000-000000000001", componentId, offeringVersionId,
    );
    const second = blueprintDeploymentCode(
      "after-school", "22222222-0000-4000-8000-000000000001", componentId, offeringVersionId,
    );
    expect(first).not.toBe(second);
    expect(first).not.toBe(blueprintDeploymentCode(
      "after-school", "11111111-0000-4000-8000-000000000001", componentId,
      "00000000-0000-4000-8000-000000000004",
    ));
  });
});
