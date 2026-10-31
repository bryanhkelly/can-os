#!/usr/bin/env node
// Publisher-format Algebra I packaging; validation is intentionally stricter than generic LMS publication.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const dir=resolve(root,"curriculum/can-high-school-core/algebra1");
const read=n=>JSON.parse(readFileSync(resolve(dir,n),"utf8"));
const fail=message=>{throw new Error(message)};
const blueprint=read("yearlong-blueprint.json");
const week1=read("unit01-week01.json");
const week2=Array.from({length:5},(_,i)=>read(`week02-day0${i+1}-draft.json`));
const guides=[read("unit01-teacher-guide.json"),...Array.from({length:5},(_,i)=>read(`week02-day0${i+1}-teacher-guide.json`))];
const lessons=[...week1.lessons,...week2.flatMap(w=>w.lessons)];
const ids=new Set();
const required=["launch","guided_practice","independent_practice"];
const prohibited=/\b(?:lorem ipsum|todo|tbd|coming soon|insert lesson|placeholder|sample lesson)\b/i;
if(blueprint.weeks?.length!==36||blueprint.targetInstructionalWeeks!==36)fail("Blueprint must map 36 instructional weeks");
for(let i=0;i<36;i++)if(blueprint.weeks[i]?.week!==i+1)fail(`Week ${i+1} missing or out of order`);
if(lessons.length!==10)fail("Expected exactly ten authored lesson days (Week 1 and Week 2)");
if(week2.some(w=>w.lessons?.length!==1))fail("Each Week 2 draft must contain one actual lesson");
for(const l of lessons){
 if(!l.id||ids.has(l.id))fail(`Missing/duplicate lesson ID: ${l.id}`);ids.add(l.id);
 if(!l.title?.trim()||!l.body?.trim()||prohibited.test(l.title+" "+l.body))fail(`Placeholder/noninstructional lesson: ${l.id}`);
 if(!l.learningTargets?.length||!l.standards?.length||!l.activities?.length)fail(`Incomplete learning plan: ${l.id}`);
 for(const k of required)if(!l.activities.some(a=>a.kind===k&&a.instructions?.length>=40))fail(`Missing real ${k}: ${l.id}`);
 if(!l.activities.some(a=>a.kind==="exit_ticket"||a.kind==="reflection"))fail(`Missing formative evidence: ${l.id}`);
 if(l.activities.reduce((n,a)=>n+(a.estimatedMinutes||0),0)!==55)fail(`Incorrect 55-minute pacing: ${l.id}`);
 if(l.resources?.length)fail(`External resources require explicit per-item licensing review: ${l.id}`);
}
if(guides.some(g=>g.visibility!=="teacher_only"||g.courseCode!=="CAN-ALG1"))fail("Teacher answer guides must stay teacher-only");
const answers=new Set(guides.flatMap(g=>g.units?.flatMap(u=>u.lessons?.filter(l=>l.workedAnswers?.length)?.map(l=>l.lessonId)||[])||[]));
for(const id of ids)if(!answers.has(id))fail(`Missing teacher answer key: ${id}`);
const answerQuestions=guides.flatMap(g=>g.units?.flatMap(u=>u.lessons?.flatMap(l=>l.workedAnswers||[])||[])||[]);
if(answerQuestions.some(q=>!q.prompt?.trim()||!q.answer?.trim()||prohibited.test(q.answer)))fail("Incomplete teacher answer");
if(week1.assessments?.length!==2||week1.assessments.some(a=>!a.instructions?.trim()||!a.rubricCriteria?.length))fail("Week 1 assessment missing");
const metadata=read("release-metadata.json");
if(metadata.license!=="LicenseRef-CAN-Original"||metadata.sourceType!=="original")fail("Source/license metadata missing or unapproved");
if(metadata.releaseStatus!=="review_required"||metadata.creditStatus!=="not_credit_ready")fail("Do not assert publication or credit readiness");
if(metadata.externalSources?.length)fail("External source licensing must be reviewed before packaging");
const summary={courseCode:"CAN-ALG1",targetWeeks:36,authoredWeeks:2,authoredLessons:lessons.length,plannedLessons:180,unwrittenLessons:170,reviewStatus:"teacher_review_required",creditStatus:"not_credit_ready",publisherAdoption:"not_authorized",assessmentGap:"Week 2 checkpoint not yet a separately authored/published assessment; subsequent weeks not authored"};
if(process.argv.includes("--report"))console.log(JSON.stringify(summary,null,2));
else if(process.argv.includes("--write")){
 const output=process.argv[process.argv.indexOf("--write")+1];
 if(!output||output.startsWith("-"))fail("Pass a destination path after --write");
 const modules=[{id:week1.unitId,title:week1.title,lessons}];
 // This is the existing classContent v1 shape; teacher guides remain separate and must never be bundled into student content.
 writeFileSync(output,JSON.stringify({version:1,syllabus:"CAN Algebra I — DRAFT. Teacher review and CAN institutional adoption required. This package contains only Weeks 1–2 of a 36-week plan.",blueprint,modules,resources:[]},null,2)+"\n");
 console.log(`Wrote non-adopted classroom draft to ${output}`);
}else fail("Use --report or --write <output.json>; no implicit publication");
