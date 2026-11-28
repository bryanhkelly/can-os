import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
test("assessment and course evidence screens exclusively use generated browser API adapters",()=>{
 for(const file of ["CourseAssessmentPanel","CanonicalCourseEvidencePanel"]){
  const source=read("src/components/learning/"+file+".tsx");
  assert.match(source,/lib\/api\/browser-assessments-outcomes/);
  assert.doesNotMatch(source,/\.functions["']/);
 }
 const adapter=read("src/lib/api/browser-assessments-outcomes.ts");
 assert.match(adapter,/apps\/api\/sdk\/client/);
 for(const route of ["knowledge-check","knowledge-check-attempts","knowledge-check-draft-answers","knowledge-check-submissions","me/course-evidence"])assert.ok(adapter.includes('"/api/v1/'+route+'"'));
 assert.doesNotMatch(adapter,/\.functions["']|localStorage|sessionStorage|Authorization:/);
});
test("unmounted assessment workspaces do not queue new writes and evidence reads are cancellable",()=>{
 const assessment=read("src/components/learning/CourseAssessmentPanel.tsx");
 assert.match(assessment,/if\(!mounted\.current\)return;\s*await saveNoncreditKnowledgeCheckAnswer/);
 assert.match(assessment,/if\(!mounted\.current\)throw new Error/);
 const evidence=read("src/components/learning/CanonicalCourseEvidencePanel.tsx");
 assert.match(evidence,/activeRequest\.current\?\.abort\(\)/);
 assert.match(evidence,/if\(!controller\.signal\.aborted\)setEvidence\(result\)/);
});
