// Static coverage inventory. A declared seed is not proof of execution or acceptance.
import {existsSync,readdirSync} from "node:fs";
const sources={
  "/access": "identity-demo-accounts.sql",
  "/admissions": "gf2-admissions-test.sql",
  "/admissions/capacity": "gf2-admissions-test.sql",
  "/admissions/families": "gf2-admissions-test.sql",
  "/profiles": "synthetic-profiles-compliance.sql",
  "/student": "student-s1-s4.sql",
  "/student/assignments": "gf1-assignments-v2.sql",
  "/student/courses": "gf40-course-registration.sql",
  "/student/experiences": "student-calendar-comms-office-hours.sql",
  "/student/study-groups": "gf26-study-groups.sql",
  "/student/support": "gf41-support-referrals.sql",
  "/teacher/missing-work": "gf1-assignments-v2.sql"
};
const pageFiles=readdirSync("src/routes").filter(f=>f.endsWith(".tsx")&&!f.startsWith("__")&&!["student.tsx","admissions.tsx"].includes(f));
const pages=pageFiles.map(file=>{const name=file.slice(0,-4);return name==="index"?"/":"/"+name.replace(/\.index$/,"").replaceAll(".","/");});
const errors=[];
for(const [route,seed] of Object.entries(sources)){
 if(!pages.includes(route))errors.push("Seed mapped to missing route: "+route);
 if(!existsSync("scripts/seeds/"+seed))errors.push("Seed missing: "+seed);
}
const unseeded=pages.filter(route=>!sources[route]);
const report={totalRoutes:pages.length,declaredSeedRoutes:pages.length-unseeded.length,unverifiedRoutes:unseeded,verification:"STATIC_ONLY; no live database, cross-persona or browser acceptance"};
console.log(JSON.stringify(report,null,2));
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}
if(unseeded.length){console.warn("Unverified fixture coverage: "+unseeded.join(", "));if(process.argv.includes("--strict"))process.exitCode=1;}
