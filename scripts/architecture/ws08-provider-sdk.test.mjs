import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
test("migrated consumers use SDK instead of the legacy outcome RPC functions",()=>{
 for(const path of ["src/components/learning/NativeClassAssessmentReviewPanel.tsx","src/components/learning/NativeClassCanonicalEvidencePanel.tsx","src/routes/canonical.my-credentials.tsx","src/routes/canonical.lab.credentials.tsx","src/components/learning/CompletionEvidenceReviewQueuePanel.tsx","src/components/learning/NativeClassCompletionOperatorPanel.tsx"]){
  const source=read(path);assert.match(source,/lib\/api\/browser-assessments-outcomes/);assert.doesNotMatch(source,/modules\/(?:classes|learning)\/[^"']+\.functions["']/);
  if(path.includes("lab.credentials"))continue;
  assert.match(source,/useAssessmentWorkspaceScope/);assert.match(source,/gcTime:\s*0/);assert.match(source,/queryFn:\s*\(\{signal\}\)/);
 }
});
