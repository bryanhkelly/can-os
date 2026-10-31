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
const week2Assessments=read("week02-assessments-draft.json");
const week2Keys=read("week02-assessment-teacher-key.json");
const week5Assessments=read("week05-assessments-draft.json");
const week5Keys=read("week05-assessment-teacher-key.json");
const week3=read("week03-lessons-draft.json");
const week4=read("week04-lessons-draft.json");
const week5=read("week05-lessons-draft.json");
const week3Guide=read("week03-teacher-guide.json");
const week4Guide=read("week04-teacher-guide.json");
const week5Guide=read("week05-teacher-guide.json");
const lessons=[...week1.lessons,...week2.flatMap(w=>w.lessons),...week3.lessons,...week4.lessons,...week5.lessons];
const ids=new Set();
const required=["launch","guided_practice","independent_practice"];
const prohibited=/\b(?:lorem ipsum|todo|tbd|coming soon|insert lesson|placeholder|sample lesson)\b/i;
if(blueprint.weeks?.length!==36||blueprint.targetInstructionalWeeks!==36)fail("Blueprint must map 36 instructional weeks");
for(let i=0;i<36;i++)if(blueprint.weeks[i]?.week!==i+1)fail(`Week ${i+1} missing or out of order`);
if(lessons.length!==25)fail("Expected 25 genuinely authored lesson days through Week 5");
if(week5.week!==5||week5.unitId!==blueprint.weeks[4].unitId||week5.lessons.length!==5)fail("Week 5 five-day content or unit mapping missing");
if(week4.week!==4||week4.unitId!==blueprint.weeks[3].unitId||week4.lessons.length!==5)fail("Week 4 five-day content or unit mapping missing");
if(week3.week!==3||week3.unitId!==blueprint.weeks[2].unitId||week3.lessons.length!==5||week3.authoredDays!==5)fail("Week 3 five-day content or unit mapping missing");
if(week2.some(w=>w.lessons?.length!==1))fail("Each Week 2 draft must contain one actual lesson");
const weeklyIds=[week1.lessons.map(l=>l.id),week2.flatMap(w=>w.lessons.map(l=>l.id)),week3.lessons.map(l=>l.id),week4.lessons.map(l=>l.id),week5.lessons.map(l=>l.id)];
for(let wi=0;wi<weeklyIds.length;wi++){
 if(weeklyIds[wi].length!==5)fail(`Week ${wi+1} must have exactly five distinct days`);
 for(let di=0;di<5;di++){
  const unit=blueprint.weeks[wi].unitId.match(/u(\d\d)$/)?.[1];
  if(!unit)fail(`Invalid blueprint unit ID for week ${wi+1}`);
  const expected=wi===0?`u01-d0${di+1}`:`u${unit}-w${String(wi+1).padStart(2,"0")}-d0${di+1}`;
  if(weeklyIds[wi][di]!==expected)fail(`Week ${wi+1} Day ${di+1} ID mismatch: expected ${expected}`);
 }
}
const allActivityIds=lessons.flatMap(l=>l.activities?.map(a=>a.id)||[]);
if(new Set(allActivityIds).size!==allActivityIds.length)fail("Activity IDs must be unique for canonical class-content validation");
for(const l of lessons){
 if(!l.id||ids.has(l.id))fail(`Missing/duplicate lesson ID: ${l.id}`);ids.add(l.id);
 if(!l.title?.trim()||!l.body?.trim()||prohibited.test(l.title+" "+l.body))fail(`Placeholder/noninstructional lesson: ${l.id}`);
 if(!l.learningTargets?.length||!l.standards?.length||!l.activities?.length)fail(`Incomplete learning plan: ${l.id}`);
 for(const k of required)if(!l.activities.some(a=>a.kind===k&&a.instructions?.length>=40))fail(`Missing real ${k}: ${l.id}`);
 if(!l.activities.some(a=>a.kind==="exit_ticket"||a.kind==="reflection"))fail(`Missing formative evidence: ${l.id}`);
 if(l.activities.reduce((n,a)=>n+(a.estimatedMinutes||0),0)!==55)fail(`Incorrect 55-minute pacing: ${l.id}`);
 if(l.resources?.length)fail(`External resources require explicit per-item licensing review: ${l.id}`);
}
guides.push(week3Guide,week4Guide,week5Guide);
if(guides.some(g=>g.visibility!=="teacher_only"||g.courseCode!=="CAN-ALG1"))fail("Teacher answer guides must stay teacher-only");
const answers=new Set(guides.flatMap(g=>g.units?.flatMap(u=>u.lessons?.filter(l=>l.workedAnswers?.length)?.map(l=>l.lessonId)||[])||[]));
for(const id of ids)if(!answers.has(id))fail(`Missing teacher answer key: ${id}`);
const answerQuestions=guides.flatMap(g=>g.units?.flatMap(u=>u.lessons?.flatMap(l=>l.workedAnswers||[])||[])||[]);
if(answerQuestions.some(q=>!q.prompt?.trim()||!q.answer?.trim()||prohibited.test(q.answer)))fail("Incomplete teacher answer");
if(week1.assessments?.length!==2||week1.assessments.some(a=>!a.instructions?.trim()||!a.rubricCriteria?.length))fail("Week 1 assessment missing");
if(week2Assessments.readiness!=="teacher_review_required"||week2Assessments.assessments?.length!==2)fail("Week 2 must have two draft assessments");
if(week5Assessments.readiness!=="teacher_review_required"||week5Assessments.unitId!==week5.unitId||week5Assessments.assessments?.length!==2)fail("Week 5 must have two draft assessments");
if(week2Keys.visibility!=="teacher_only")fail("Assessment answers must be teacher-only");
if(week5Keys.visibility!=="teacher_only")fail("Week 5 keys must be teacher-only");
const keyedAssessments=new Map([week2Keys,week5Keys].flatMap(k=>k.units.flatMap(u=>(u.assessments||[]).map(a=>[a.assessmentKey,a.workedAnswers]))));
for(const a of [...week2Assessments.assessments,...week5Assessments.assessments]){
 if(!a.key||!a.instructions?.trim()||!a.rubricCriteria?.length||!keyedAssessments.get(a.key)?.length)fail(`Missing assessment or protected key: ${a.key}`);
 if(a.rubricCriteria.reduce((sum,r)=>sum+r.maxPoints,0)!==a.pointsPossible)fail(`Rubric points mismatch: ${a.key}`);
 if(keyedAssessments.get(a.key).some(q=>!q.prompt?.trim()||!q.answer?.trim()))fail(`Incomplete assessment key: ${a.key}`);
}
const metadata=read("release-metadata.json");
if(metadata.license!=="LicenseRef-CAN-Original"||metadata.sourceType!=="original")fail("Source/license metadata missing or unapproved");
if(metadata.releaseStatus!=="review_required"||metadata.creditStatus!=="not_credit_ready")fail("Do not assert publication or credit readiness");
if(metadata.externalSources?.length)fail("External source licensing must be reviewed before packaging");
const summary={courseCode:"CAN-ALG1",yearlongComplete:false,releaseReady:false,targetWeeks:36,authoredWeeks:5,authoredLessons:lessons.length,plannedLessons:180,unwrittenLessons:155,reviewStatus:"teacher_review_required",creditStatus:"not_credit_ready",publisherAdoption:"not_authorized",assessmentGap:"Weeks 2 and 5 standalone assessments drafted but not teacher-approved; remaining week assessments missing"};
if(process.argv.includes("--report"))console.log(JSON.stringify(summary,null,2));
else if(process.argv.includes("--write")){
 const output=process.argv[process.argv.indexOf("--write")+1];
 if(!output||output.startsWith("-"))fail("Pass a destination path after --write");
 const modules=[{id:week1.unitId,title:week1.title,lessons:lessons.filter(l=>!l.id.startsWith("u02-"))},{id:week5.unitId,title:"Unit 2 · Functions and representations",lessons:week5.lessons}];
 // This is the existing classContent v1 shape; teacher guides remain separate and must never be bundled into student content.
 writeFileSync(output,JSON.stringify({version:1,syllabus:"CAN Algebra I — DRAFT. Teacher review and CAN institutional adoption required. This package contains only Weeks 1–5 of a 36-week plan.",blueprint,modules,resources:[]},null,2)+"\n");
 console.log(`Wrote non-adopted classroom draft to ${output}`);
}else fail("Use --report or --write <output.json>; no implicit publication");
