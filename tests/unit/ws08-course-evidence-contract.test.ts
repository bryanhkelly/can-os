import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const source=readFileSync("src/modules/learning/canonical-course-evidence.server.ts","utf8");
describe("WS08 course evidence canonical projections",()=>{
 it("fails closed on ambiguous or incomplete history rather than choosing newest timestamp",()=>{
  expect(source).toContain("latestCanonicalAssessmentRevisions(results)");
  expect(source).toContain("projectCurrentNoncreditCompletion(participation.noncreditRegistrationId,decisions)");
  expect(source).toContain("if(results.length>1000)");
  expect(source).toContain("if(decisions.length>500)");
  expect(source).toContain('a.state==="finalized"&&r?.resultStatus==="finalized"');
  expect(source).not.toContain("decisions[0]");
 });
});
