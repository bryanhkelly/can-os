import {type BrowserContext,type Page} from "@playwright/test";
const origin="http://localhost:5183";
const modules={
  release:"/src/modules/learning/native-offering-release.functions.ts",
  classes:"/src/modules/classes/unified-class.functions.ts",
  adoption:"/src/modules/programs/native-offering-adoption-review.functions.ts",
  blueprint:"/src/modules/blueprints/blueprint-studio.functions.ts",
  deployment:"/src/modules/programs/native-deployment-placement.functions.ts",
  registration:"/src/modules/enrollment/noncredit-self-enrollment.functions.ts",
  enrollment:"/src/modules/classes/native-class-enrollment.functions.ts",
  onboarding:"/src/modules/classes/native-class-reviewed-onboarding.functions.ts",
  recovery:"/src/modules/classes/native-class-session-recovery.functions.ts",
  session:"/src/modules/classes/native-class-sessions.functions.ts",
  agenda:"/src/modules/classes/native-class-session-agenda.functions.ts",
  room:"/src/modules/learning/facilitated-learning.functions.ts",
  attendance:"/src/modules/learning/classroom-attendance.functions.ts",
  projector:"/src/modules/learning/classroom-projector.functions.ts",
  activity:"/src/modules/learning/classroom-evidence.functions.ts",
  relationships:"/src/modules/reporting/bottom-up-reporting-relationships.functions.ts",
  report:"/src/modules/reporting/native-class-report.functions.ts",
  familyHome:"/src/modules/family/family-home.functions.ts",
  familyAcademics:"/src/modules/learning/guardian-academic-queries.functions.ts",
  familyApplications:"/src/modules/enrollment/guardian-family-applications.functions.ts",
  familyAttendance:"/src/modules/attendance/onsite-attendance-workflow.functions.ts",
  familyNative:"/src/modules/classes/native-class-guardian-enrollment.functions.ts",
} as const;
export async function pilotRpcPage(context:BrowserContext):Promise<Page>{
  const page=await context.newPage();
  await page.route(origin+"/__pilot_api_test_context",route=>route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>Isolated QA API</title>"}));
  await page.goto(origin+"/__pilot_api_test_context");
  return page;
}
export async function pilotRpc<T=unknown>(page:Page,module:keyof typeof modules,command:string,data?:unknown):Promise<T>{
  return page.evaluate(async({url,command,data})=>{
    const api=await import(/* @vite-ignore */ url);
    const fn=api[command];
    if(typeof fn!=="function")throw Error("Missing production server function");
    return await fn({data});
  },{url:modules[module],command,data}) as Promise<T>;
}

/** Check the public safe error contract inside the browser, before Playwright
 * serializes thrown objects. Transport failures and unexpected exceptions
 * cannot satisfy authorization acceptance. */
export async function expectPilotDenial(page:Page,module:keyof typeof modules,command:string,data:unknown,
  codes:readonly string[]=["FORBIDDEN"]):Promise<void>{
  const result=await page.evaluate(async({url,command,data})=>{
    const api=await import(/* @vite-ignore */ url);
    const fn=api[command];
    if(typeof fn!=="function")throw Error("Missing production server function");
    try{await fn({data});return {denied:false,code:null};}
    catch(error){const code=error&&typeof error==="object"&&"code" in error&&typeof error.code==="string"?error.code:null;
      return {denied:true,code};}
  },{url:modules[module],command,data});
  if(!result.denied||!result.code||!codes.includes(result.code))throw Error("Expected explicit domain denial was not returned");
}
