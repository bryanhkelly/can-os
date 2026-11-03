#!/usr/bin/env node
/**
 * Idempotent research-only staging for eight CAN jurisdictions.
 * No profile is published or independently verified, no school-specific
 * requirements/actions are created, and no existing revision is overwritten.
 *
 * Dry run (default): DATABASE_URL=... node scripts/seed-sourced-jurisdiction-research.mjs
 * Explicit apply: JURISDICTION_SEED_ALLOW_WRITE=1
 *                 JURISDICTION_SEED_DATABASE_CONFIRMED=<actual_database_name>
 *                 DATABASE_URL=... node scripts/seed-sourced-jurisdiction-research.mjs --apply
 */
import { Pool } from "@neondatabase/serverless";

const revision="research-2026-11-03";
const checkedAt="2026-11-03T15:00:00.000Z";
const research={
 TX:{
  name:"Texas",source:"https://educationfreedom.texas.gov/",authority:"Texas Education Freedom Accounts",
  funding:"Texas Education Freedom Accounts (TEFA)",
  fact:"The program has an application and provider-approval process. Private school providers must satisfy accreditation, operating-history and assessment criteria; a newly proposed CAN location is not presumed eligible.",
  questions:["Verify whether a qualified school of record and proposed campus meet TEFA provider criteria.","Confirm current private-school registration, academic accountability and student-record obligations.","Identify which host-site functions require local facilities, safety and staffing review."],
 },
 FL:{
  name:"Florida",source:"https://www.stepupforstudents.org/scholarships/private-school/",authority:"Step Up For Students",
  funding:"Florida Tax Credit and Family Empowerment Scholarship (Educational Options)",
  fact:"Florida private-school scholarships can support tuition at eligible private schools. Eligibility for a family, scholarship approval, school participation and CAN's proposed operating model are separate decisions.",
  questions:["Verify the school-of-record and church-host arrangement against Florida private-school requirements.","Confirm participating-school and scholarship-administrator rules before describing tuition as scholarship eligible.","Review school registration, records, attendance, safety and student-services responsibilities."],
 },
 AZ:{
  name:"Arizona",source:"https://www.azed.gov/empowerment-scholarship-account-program",authority:"Arizona Department of Education",
  funding:"Arizona Empowerment Scholarship Account (ESA)",
  fact:"Arizona ESAs may support private-school tuition, curriculum and other eligible educational expenses, including some home-education purchases. The approved use and provider relationship depend on the actual model.",
  questions:["Determine whether the intended arrangement is a private school, home education or educational-service provider.","Verify eligibility of the proposed CAN services and payment process.","Review local operating, safeguarding, student-record and facility obligations."],
 },
 WV:{
  name:"West Virginia",source:"https://hopescholarshipwv.gov/",authority:"West Virginia Hope Scholarship Board",
  funding:"West Virginia Hope Scholarship",
  fact:"Hope Scholarship supports qualifying education expenses through a student application and participation framework. New applicants' award amounts depend on timing; a scholarship is not authorization to open a school.",
  questions:["Classify CAN and church-host functions under the current Hope Scholarship participation rules.","Verify notice, application, expense and provider rules for the proposed model.","Review school-of-record, attendance, safeguarding and recordkeeping obligations."],
 },
 AR:{
  name:"Arkansas",source:"https://dese.ade.arkansas.gov/Offices/office-of-school-choice-and-parent-empowerment/education-freedom-accounts/",authority:"Arkansas Division of Elementary and Secondary Education",
  funding:"Arkansas Education Freedom Accounts (EFA)",
  fact:"The EFA program covers categories including private-school tuition, homeschool curriculum and eligible educational services. Participating private schools and service providers have separate requirements.",
  questions:["Evaluate the right EFA participating-school or service-provider pathway.","Review eligibility, assessment, financial reporting and payment mechanics.","Confirm school-of-record and church-host staffing, safeguarding and records responsibilities."],
 },
 IA:{
  name:"Iowa",source:"https://educate.iowa.gov/pk-12/educational-choice/education-savings-accounts",authority:"Iowa Department of Education",
  funding:"Iowa Students First Education Savings Accounts",
  fact:"Iowa ESAs support tuition and qualifying expenses for eligible students attending accredited nonpublic schools; 2026–27 published amounts and deadlines require verification before financial planning.",
  questions:["Determine how a church-hosted location could satisfy accredited nonpublic-school attendance criteria.","Review school enrollment, reporting, accreditation and student record obligations.","Confirm ESA portal payment deadlines and funding timing for the planned opening year."],
 },
 OK:{
  name:"Oklahoma",source:"https://oklahoma.gov/tax/individuals/parental-choice-tax-credit.html",authority:"Oklahoma Tax Commission",
  funding:"Oklahoma Parental Choice Tax Credit",
  fact:"Oklahoma's parental choice funding is a refundable taxpayer credit for eligible private-school tuition rather than an automatic scholarship disbursement to a new provider.",
  questions:["Verify whether the proposed school qualifies for private-school tax-credit participation.","Review family application, tuition verification, tax-credit timing and financial exposure.","Confirm local school-of-record, safeguarding and operational responsibilities."],
 },
 WI:{
  name:"Wisconsin",source:"https://dpi.wi.gov/choice",authority:"Wisconsin Department of Public Instruction",
  funding:"Wisconsin Private School Choice Programs",
  fact:"Wisconsin administers private-school choice programs with school registration and student eligibility rules that vary by program, location and other criteria.",
  questions:["Identify the applicable choice program and eligible geography for the site.","Determine participating-school approval requirements for the planned CAN school of record.","Review enrollment, accountability, records and campus operating requirements."],
 },
};
const apply=process.argv.includes("--apply");
if(apply && (process.env.JURISDICTION_SEED_ALLOW_WRITE!=="1" || !process.env.JURISDICTION_SEED_DATABASE_CONFIRMED))
 throw Error("Explicit write opt-in and expected database identity required");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
const results=[];
try{
 await client.query("BEGIN");
 if(apply){
  const db=await client.query("SELECT current_database() AS name");
  if(db.rows[0]?.name!==process.env.JURISDICTION_SEED_DATABASE_CONFIRMED)
   throw Error("Database identity mismatch");
 }
 for(const [code,entry] of Object.entries(research)){
  const found=await client.query(
   "SELECT id FROM jurisdictions WHERE region_code=$1 OR code=ANY($2::text[]) ORDER BY CASE WHEN region_code=$1 THEN 0 ELSE 1 END LIMIT 1",
   [code,[code,`US-${code}`,`US_${code}`]],
  );
  if(!found.rowCount){results.push({state:code,status:"jurisdiction_missing"});continue;}
  const jurisdictionId=found.rows[0].id;
  const present=await client.query(
   "SELECT id,status FROM jurisdiction_profile_versions WHERE jurisdiction_id=$1 AND revision=$2 LIMIT 1",
   [jurisdictionId,revision],
  );
  if(present.rowCount){results.push({state:code,status:"already_exists"});continue;}
  const source={title:`${entry.funding} official program information`,url:entry.source,authority:entry.authority,checkedAt};
  const profile={
   summary:`Preliminary research for ${entry.name}. ${entry.fact} CAN school eligibility, legal authority and operating requirements remain under independent review.`,
   editorial:{launchResearchVisibility:"school_operator",reviewState:"in_review",verificationStatus:"unverified"},
   operatingModels:[],
   fundingPrograms:[{id:`research-${code.toLowerCase()}-funding`,name:entry.funding,summary:entry.fact,eligibilityStatus:"under_review",evidenceIds:[entry.source]}],
   requirements:entry.questions.map((description,i)=>({
    id:`research-${code.toLowerCase()}-${i+1}`,
    title:["Confirm operating and provider eligibility","Review program and school requirements","Confirm local responsibilities"][i],
    description,responsibleParty:i===2?"church":"can",
    phase:i===1?"before_enrollment":"before_opening",
    evidenceIds:[entry.source],disclosureAudience:"public_optional",
    category:i===2?"safety":"authorization",
    // Intentionally no applicability. An independent legal review must scope
    // the source before it may affect a specific school's readiness.
   })),
  };
  if(apply)await client.query(
   `INSERT INTO jurisdiction_profile_versions
    (jurisdiction_id,revision,status,title,summary,profile,evidence,verification_status)
    VALUES ($1,$2,'in_review',$3,$4,$5::jsonb,$6::jsonb,'unverified')`,
   [jurisdictionId,revision,`${entry.name} preliminary school launch research`,profile.summary,JSON.stringify(profile),JSON.stringify([source])],
  );
  results.push({state:code,status:apply?"created_in_review":"would_create_in_review",funding:entry.funding});
 }
 if(apply)await client.query("COMMIT");else await client.query("ROLLBACK");
 console.log(JSON.stringify({apply,revision,results},null,2));
}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();await pool.end();}
