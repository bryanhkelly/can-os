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
  it("uses the same request identity for all five custody writer actions", () => {
    const cmds=["resolvePickupCustodyHold","recordVerifiedPickupRelease",
      "recordDeniedPickup","createPickupCustodyHold","recordUncollectedChild"];
    for(const command of cmds) expect(source).toContain("(mutationId) => "+command+"({ data: {");
    expect(source.match(/mutationId: crypto\.randomUUID\(\)/g)).toBeNull();
    expect(source.match(/mutationId,/g)).toHaveLength(5);
  });
  it("drops pending identities when the school day changes", () => {
    expect(source).toContain("pendingMutationIds.current.clear()");
  });
});
