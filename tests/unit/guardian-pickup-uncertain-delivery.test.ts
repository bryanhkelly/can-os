import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("guardian pickup command retry identity", () => {
  const code=readFileSync("src/components/operations/GuardianPickupPanel.tsx","utf8");
  const run=code.slice(code.indexOf("async function run("),code.indexOf("return <WorkspacePanel",code.indexOf("async function run(")));
  it("reuses original UUID after lost response but retires it only after acknowledged server success",()=>{
    expect(run).toContain("pendingMutationIds.current.get(key) ?? crypto.randomUUID()");
    expect(run.indexOf("pendingMutationIds.current.set(key, mutationId)"))
      .toBeLessThan(run.indexOf("await command(mutationId)"));
    expect(run.indexOf("pendingMutationIds.current.delete(key)"))
      .toBeGreaterThan(run.indexOf("await command(mutationId)"));
    expect(run.slice(run.indexOf("} catch (cause)"))).not.toContain("pendingMutationIds.current.delete(key)");
  });
  it("reuses the UUID for family authorization, revocation and a restrictive custody hold",()=>{
    for(const command of ["createPickupAuthorization","revokePickupAuthorization","createPickupCustodyHold"])
      expect(code).toContain("(mutationId) => "+command+"({ data: {");
    expect(code.match(/mutationId: crypto\.randomUUID\(\)/g)).toBeNull();
    expect(code.match(/mutationId,/g)).toHaveLength(3);
  });
  it("does not reuse a child's request after a different child context mounts",()=>{
    expect(code).toContain("pendingMutationIds.current.clear()");
  });
});
