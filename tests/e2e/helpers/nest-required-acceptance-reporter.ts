import type {Reporter,FullConfig,Suite,FullResult,TestCase,TestResult} from "@playwright/test/reporter";
// A release suite cannot pass by skipping a required test or retrying a mutation.
export default class RequiredAcceptanceReporter implements Reporter{
 private expected=new Set<string>();
 private completed=new Set<string>();
 private invalid=false;
 onBegin(_config:FullConfig,suite:Suite){
  for(const t of suite.allTests()){
   if(t.expectedStatus!=="passed"||this.expected.has(t.id))this.invalid=true;
   this.expected.add(t.id);
  }
  if(this.expected.size===0)this.invalid=true;
 }
 onTestEnd(test:TestCase,result:TestResult){
  if(result.status!=="passed"||test.expectedStatus!=="passed"||result.retry!==0||this.completed.has(test.id))this.invalid=true;
  else this.completed.add(test.id);
 }
 onEnd(result:FullResult){
  if(result.status==="passed"&&(this.invalid||this.expected.size!==this.completed.size)){
   console.error("Required acceptance did not execute every test successfully on its first attempt.");
   return {status:"failed" as const};
  }
 }
}
