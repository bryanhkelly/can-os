#!/usr/bin/env node
/**
 * WS00 integration-only cross-stream regression gate.
 * Intended for the merged integration tree, NOT individual feature branches.
 * Static/source assertions supplement, never replace TypeScript, unit, DB/RLS
 * or authenticated end-to-end execution.
 *
 * Usage: node scripts/acceptance/check-ws00-cross-stream-guards.mjs
 */
import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";

const root=process.cwd();
const failures=[];
const successes=[];
function read(path){
  const file=join(root,path);
  if(!existsSync(file))throw new Error("Missing required integrated source: "+path);
  return readFileSync(file,"utf8");
}
function required(ok,desc){if(!ok)throw new Error(desc);}
function check(name,run){
  try{run();successes.push(name);console.log("PASS "+name);}
  catch(error){failures.push({name,error:error instanceof Error?error.message:String(error)});
    console.error("FAIL "+name+": "+failures.at(-1).error);}
}
function segment(source,start,end){
  const begin=source.indexOf(start);
  required(begin>=0,"Missing "+start);
  const finish=end?source.indexOf(end,begin+start.length):-1;
  return source.slice(begin,finish>begin?finish:undefined);
}

check("WS2+WS5 native Class publication keeps operational enrollment/credit guard",()=>{
  const s=read("src/modules/classes/unified-class.functions.ts");
  const publish=segment(s,"export const publishUnifiedClassOffering","export const closeUnifiedClassOffering");
  required(s.includes("assertOperationalClassOfferingTerms"),"WS2 shared policy import missing");
  required(/assertOperationalClassOfferingTerms\s*\(\s*terms\s*\)/.test(publish),
    "P0: WS5 publisher lost WS2 server-side terms guard");
  required(publish.indexOf("assertOperationalClassOfferingTerms") <
           publish.indexOf("await tx.update(canonicalClassOfferingVersions)"),
    "Operational method/credit validation must happen before publication write");
  required(s.includes("localClassPolicy") &&
           read("src/domain/publisher-class-variation.ts").includes("publisherClassVariationPolicy"),
    "WS5 publisher variation policy missing");
});
check("WS2 Class lifecycle retains transactional terminal and source validation",()=>{
  const s=read("src/modules/classes/native-class-lifecycle.server.ts");
  required(s.includes('canonicalClasses')&&s.includes('for("update")'),
    "Missing parent Class row lock for seat mutation");
  const attempts=read("src/modules/classes/native-class-attempt.server.ts");
  required(s.includes("withdrawNativeClassAttempts") &&
           attempts.includes("assertNativeClassAttemptForExit") &&
           s.includes("assertCurrentNativeClassLearnerForMutation"),
    "Missing exact linked attempt/current learner verification");
});
check("WS3 completion takes parent Class lock before Enrollment",()=>{
  const s=read("src/modules/classes/native-class-completion.functions.ts");
  const decide=segment(s,"export const decideNativeClassCompletion","const queueInput=");
  const classLock=/\.from\(canonicalClasses\)[\s\S]{0,280}?\.for\(["']update["']\)/.exec(decide);
  const enrollmentLock=/\.from\(canonicalClassEnrollments\)[\s\S]{0,280}?\.for\(["']update["']\)/.exec(decide);
  required(!!classLock,"P0: missing Class FOR UPDATE lock in completion command");
  required(!!enrollmentLock,"Missing exact Class Enrollment FOR UPDATE lock");
  required(classLock.index<enrollmentLock.index,
    "P0: WS3 Enrollment-first lock order conflicts with WS2 Class-first seat lifecycle");
  required(decide.includes("assertSourceBoundCompletionEvidence"),
    "Governed completion must retain independent source evidence binding");
});
check("WS3 rejects ambiguous assessment revisions and preserves current authorization",()=>{
  const revisions=read("src/domain/canonical-assessment-revisions.ts");
  const completion=read("src/modules/classes/native-class-completion.functions.ts");
  const reader=read("src/modules/classes/native-class-canonical-evidence.functions.ts");
  required(revisions.includes("if(ambiguous.has(attemptId))continue;"),
    "WS3 current-grade projection must fail closed when an attempt has invalid revisions");
  required(completion.includes("latestCanonicalAssessmentRevisions") &&
           completion.includes("projected.ambiguousAttemptIds.length"),
    "WS3 completion cannot use an older passing grade when a newer correction is ambiguous");
  required(reader.includes("latestCanonicalAssessmentRevisions") &&
           reader.includes("projected.ambiguousAttemptIds.length"),
    "WS3 learner evidence must not expose a provisional/voided grade as current");
});
check("WS4 keeps canonical Session identity and immutable change evidence",()=>{
  const s=read("src/modules/classes/native-class-sessions.functions.ts");
  required(s.includes("ClassSessionScheduleChanged"),
    "Missing immutable original/replacement Session change event");
  required(read("src/modules/classes/native-class-session-agenda.functions.ts")
    .includes("expectedRevisionNo"),"Agenda revision optimistic concurrency missing");
  required(read("database/canonical/v3.0.1/patch-class-session-agendas-ws4.sql")
    .includes("class_session_agenda_revisions"),"Proposed additive agenda schema missing");
});
check("WS1 activity distinguishes participation from waitlist and remains source-scoped",()=>{
  const c=read("src/domain/participation-read-model.ts");
  const service=read("src/modules/learning/my-activity.functions.ts");
  required(c.includes('PARTICIPATION_READ_MODEL_VERSION = "1.1.0"'),
    "PRM v1.1.0 contract mismatch; requires explicit WS00 re-ratification");
  required(c.includes("opportunities: ParticipationOpportunity[]") &&
           service.includes("assertParticipationReadModel(result)"),
    "Waitlist opportunity separation/identity guard missing");
  required(read("src/routes/learn.activity.tsx").includes("/learn/my-activity") &&
           read("src/routes/learn.my-activity.tsx").includes("MyActivity"),
    "My Activity canonical URL/compatibility broken");
  const view=read("src/routes/learn.my-activity.tsx");
  const school=read("src/modules/learning/account-school-participation.functions.ts");
  const native=read("src/modules/classes/native-class-enrollment.functions.ts");
  const noncredit=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
  required(service.includes("getMyNativeClassHistoryForCanAccountPage") &&
           service.includes("getMyNoncreditSelfEnrollmentHistoryPage") &&
           service.includes("getMyAccountSchoolParticipationPage") &&
           service.includes("getMyActivitySourcePage") &&
           service.includes("nextCursors") &&
           !service.includes("readBoundedNativeClassHistory") &&
           view.includes("Load older activity") &&
           view.includes("getMyActivitySourcePage") &&
           school.includes("profileScope(") &&
           school.includes("guardianRelationshipPredicate") &&
           native.includes("readNativeClassHistoryPage(") &&
           noncredit.includes("personalNoncreditCursor"),
    "WS1 must support source-authorized unlimited pagination across verified memberships");
});
check("WS6 maintains evidence metrics without fabricated formal Class completions",()=>{
  const s=read("src/domain/participation-reporting.ts");
  const report=read("src/modules/reporting/native-class-report.functions.ts");
  required(/formalCompletions\s*:\s*null\b/.test(s),
    "Formal Class completion must remain unknown until verified WS3 authority is reviewed");
  required(report.includes('isolationLevel:"repeatable read"') &&
           report.includes('accessMode:"read only"'),
    "Reporting must be read-only under repeatable-read snapshot");
  required(report.includes("assertExactClassReportingScope"),
    "Missing exact-Site/Organization reporting security");
  required(report.includes("inArray(learnerCourseAttempts.classEnrollmentId,enrollmentIds)") &&
           report.includes("courseAttemptIds:attemptsByEnrollment.get(e.id)"),
    "WS6 must query all exact Class Enrollment retakes; selected pointer is not history");
  required(report.includes("attempt.adoptionId!==cls.adoptionId") &&
           report.includes("attempt.offeringVersionId!==cls.offeringVersionId"),
    "WS6 retakes must retain the exact adopted Course/Offering origin");
  required(s.includes("courseAttemptIds?: readonly string[]") &&
           s.includes("const attemptToEnrollment=new Map<string,string>()"),
    "Class reporting must reconcile retakes without duplicating registration or Person");
});
check("Shared route registry preserves WS1 and WS5 without deleting either",()=>{
  const routes=JSON.parse(read("docs/platform-route-contracts.json"));
  const entries=Array.isArray(routes)?routes:Array.isArray(routes.routes)?routes.routes:[];
  required(entries.some(x=>x.route==="/learn/my-activity"),
    "WS1 route contract lost");
  required(entries.some(x=>x.route==="/canonical/program-operations"),
    "WS5 route contract lost");
  const nav=read("src/components/shell/workspace-navigation.registry.ts");
  required(nav.includes("/learn/my-activity")&&nav.includes("/canonical/program-operations"),
    "One workstream overwrote another's navigation");
});
check("WS3 governed completion and WS6 reporting routes are indexed, no duplicate paths",()=>{
  const routes=JSON.parse(read("docs/platform-route-contracts.json"));
  const entries=Array.isArray(routes)?routes:routes.routes;
  required(Array.isArray(entries),"Missing route registry array");
  const urls=new Set();
  for(const route of entries){
    required(!urls.has(route.route),"Duplicate contract route "+route.route);
    urls.add(route.route);
  }
  for(const url of [
    "/canonical/completion-evidence-reviews",
    "/canonical/noncredit/completion",
    "/class_/$classId",
    "/reports/",
  ])required(urls.has(url),"Missing governed completion/reporting route "+url);
  required(entries.some(x=>x.route==="/class_/$classId" && x.file==="src/routes/class_.$classId.tsx"),
    "Class evidence drilldown must be indexed at its canonical workspace route");
  const detail=read("src/routes/class_.$classId.tsx");
  required(detail.includes('workspace.tab==="reports"') && detail.includes('NativeClassReportPanel') &&
    detail.includes('<NativeClassReportPanel classId={workspace.classId}/>'),
    "Class Reports tab must reuse the WS6 verified evidence panel inside /class");
  required(read("src/components/shell/workspace-navigation.registry.ts")
      .includes('path: "/reports/"'),
    "Authorized Site administration reports navigation missing");
});
check("Latest main Cloudflare planning preflight remains intact",()=>{
  const pkg=JSON.parse(read("package.json"));
  required(pkg.scripts?.["prebuild:cloudflare"]?.includes("verify-site-planning-imports.mjs"),
    "Main's latest Cloudflare build safety preflight was lost");
  read("scripts/verify-site-planning-imports.mjs");
});
console.log("\nWS00 cross-stream source gates: "+successes.length+" passed, "+failures.length+" failed.");
if(failures.length){console.error("NOT MERGE-READY. These are static gates only; full QA remains mandatory.");process.exitCode=1;}
else console.log("Static cross-stream guards satisfied. This is NOT an app build, database or E2E pass.");
