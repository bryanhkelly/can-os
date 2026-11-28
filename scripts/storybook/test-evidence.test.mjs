import {test} from "node:test";
import assert from "node:assert/strict";
import {interactionEvidenceErrors,browserEvidenceErrors} from "./test-evidence.mjs";
const interaction={testResults:[{status:"passed",assertionResults:[{status:"passed"}]}],numPassedTests:1,numFailedTests:0,numFailedTestSuites:0,success:true};
const browser={suites:[{title:"story fixture"}],stats:{expected:1,unexpected:0,flaky:0,skipped:4},errors:[]};
test("complete passing test evidence is accepted",()=>{
 assert.deepEqual(interactionEvidenceErrors(interaction),[]);
 assert.deepEqual(browserEvidenceErrors(browser),[]);
});
test("empty and malformed evidence cannot pass",()=>{
 for(const bad of [null,{}, {...interaction,testResults:[]},{...interaction,numPassedTests:0},{...interaction,success:undefined}])assert.ok(interactionEvidenceErrors(bad).length);
 for(const bad of [null,{}, {...browser,suites:[]},{...browser,stats:{...browser.stats,expected:0}},{...browser,errors:undefined}])assert.ok(browserEvidenceErrors(bad).length);
});
test("failed suites, unhandled errors and flaky browser tests cannot pass",()=>{
 for(const bad of [{...interaction,success:false},{...interaction,numFailedTestSuites:1},{...interaction,testResults:[{status:"passed",assertionResults:[{status:"failed"}]}]}])assert.ok(interactionEvidenceErrors(bad).length);
 for(const bad of [{...browser,stats:{...browser.stats,unexpected:1}},{...browser,stats:{...browser.stats,flaky:1}},{...browser,errors:[{message:"runner error"}]}])assert.ok(browserEvidenceErrors(bad).length);
});
