import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("staff pickup form preserves a request ID after uncertain delivery", () => {
  const source = readFileSync("src/components/operations/OnsitePickupPanel.tsx", "utf8");
  const method = source.slice(source.indexOf("async function run("),source.indexOf("return <WorkspacePanel",source.indexOf("async function run(")));
  it("holds one UUID per witnessed command until the server confirms it", () => {
    expect(method).toContain("pendingMutationIds.current.get(key) ?? crypto.randomUUID()");
    expect(method.indexOf("pendingMutationIds.current.set(key, mutationId)"))
      .toBeLessThan(method.indexOf("await command(mutationId)"));
    expect(method.indexOf("pendingMutationIds.current.delete(key)"))
      .toBeGreaterThan(method.indexOf("await command(mutationId)"));
    const errorBlock=method.slice(method.indexOf("} catch (cause)"));
    expect(errorBlock).not.toContain("pendingMutationIds.current.delete(key)");
    expect(errorBlock).toContain("reuse the original request ID");
  });
  it("reuses the same retryable request identity for every custody command", () => {
    const commands=["resolvePickupCustodyHold","proposePickupCustodyResolution",
      "recordVerifiedPickupRelease","recordDeniedPickup",
      "createPickupCustodyHold","recordUncollectedChild"];
    for(const command of commands) {
      const parenthesized="(mutationId) => "+command+"({ data: {";
      const direct="mutationId => "+command+"({ data: {";
      const compact="mutationId=>"+command+"({data:{";
      expect(
        source.includes(parenthesized) || source.includes(direct) ||
        source.includes(compact)
      ).toBe(true);
    }
    expect(source.match(/mutationId: crypto\.randomUUID\(\)/g)).toBeNull();
    expect(source.match(/mutationId,/g)).toHaveLength(commands.length);
  });
  it("drops pending identities when the school day changes", () => {
    expect(source).toContain("pendingMutationIds.current.clear()");
  });
});
