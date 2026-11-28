import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
describe("Class evidence separates baseline from final outcomes",()=>{it("does not label diagnostic passing results as final",()=>{
 const service=readFileSync("src/modules/classes/native-class-canonical-evidence.server.ts","utf8");
 expect(service).toContain('finalizedPassed:finalResults.filter');
 expect(service).toContain('finalizedBaselineAssessments:valid.filter');
 expect(service).toContain('eq(assessmentDefinitions.ownerOrganizationId,publisherOrganizationId)');
 const panel=readFileSync("src/components/learning/NativeClassCanonicalEvidencePanel.tsx","utf8");
 expect(panel).toContain('phase="baseline"');expect(panel).toContain("It does not count as a final passing assessment.");
});});
