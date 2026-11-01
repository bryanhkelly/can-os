import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("guardian custody history limits direct staff evidence",()=>{
 it("does not render denied adult identities or internal witness fields",()=>{
   const source=readFileSync("src/components/operations/GuardianPickupPanel.tsx","utf8");
   expect(source).toContain("Internal witness evidence, disputed custody reports");
   expect(source).not.toContain("event.handoffEvidence");
   expect(source).not.toContain("event.denialReason");
 });
});
