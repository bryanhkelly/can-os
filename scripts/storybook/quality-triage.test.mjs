import {test} from "node:test";
import assert from "node:assert/strict";
import {aggregateFailures,markdownReport} from "./quality-triage.mjs";
const color='Element has insufficient color contrast (foreground color: #1769ef, background color: #eaf1ff)\n"Elements must meet minimum color contrast ratio thresholds (color-contrast)"\nhttps://dequeuniversity.com/rules/axe/4.14/color-contrast';
test("groups by shared color pair and deduplicates each story",()=>{
 const result=aggregateFailures({numFailedTests:2,testResults:[{name:"C:\\repo\\src\\button.stories.tsx",assertionResults:[{status:"failed",title:"One",failureMessages:[color,color]},{status:"failed",title:"Two",failureMessages:[color]},{status:"passed",title:"Three"}]}]});
 assert.equal(result.failedStories,2);
 assert.equal(result.groups.length,1);
 assert.equal(result.groups[0].affectedStories,2);
 assert.match(markdownReport(result),/color-contrast #1769ef on #eaf1ff/);
});
test("keeps runtime and interaction failures distinct from accessibility",()=>{
 const result=aggregateFailures({testResults:[{name:"/repo/src/a.stories.tsx",assertionResults:[{status:"failed",title:"A",failureMessages:["Error: No QueryClient set"]},{status:"failed",title:"B",failureMessages:["AssertionError: expected 1 to equal 2"]}]},{name:"/repo/src/b.stories.tsx",status:"failed",message:"Cannot load module",assertionResults:[]}]});
 assert.equal(result.failedStories,3);
 assert.deepEqual(result.groups.map(g=>g.category).sort(),["fixture/runtime","interaction","suite/runtime"]);
});
test("rejects missing result evidence",()=>assert.throws(()=>aggregateFailures({}),/Missing Vitest/));

test("development overlay is a runtime failure, not a product scroll violation",()=>{
 const message='Expected HTML found at vite-error-overlay,.stack\\n"Scrollable region (scrollable-region-focusable)"\\nhttps://dequeuniversity.com/rules/axe/4.14/scrollable-region-focusable';
 const result=aggregateFailures({numFailedTests:1,testResults:[{name:"/repo/src/a.stories.tsx",assertionResults:[{status:"failed",title:"A",failureMessages:[message]}]}]});
 assert.equal(result.groups.length,1);
 assert.equal(result.groups[0].category,"fixture/runtime");
});
test("required labels are not mistaken for axe rule identifiers",()=>{
 const result=aggregateFailures({numFailedTests:1,testResults:[{name:"/repo/src/a.stories.tsx",assertionResults:[{status:"failed",title:"A",failureMessages:['TestingLibraryElementError: Name "Organization(required)"']}]}]});
 assert.equal(result.groups.length,1);
 assert.equal(result.groups[0].category,"interaction");
});
