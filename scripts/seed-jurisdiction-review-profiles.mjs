#!/usr/bin/env node
/**
 * Idempotent jurisdiction profile bootstrap. Seeds review-only editorial
 * placeholders, not verified legal claims. Default: dry run.
 *
 * DATABASE_URL=... node scripts/seed-jurisdiction-review-profiles.mjs
 * JURISDICTION_SEED_ALLOW_WRITE=1 DATABASE_URL=... node scripts/seed-jurisdiction-review-profiles.mjs --apply
 */
import { Pool } from "@neondatabase/serverless";
const states=[
  ["TX","Texas"],["FL","Florida"],["AZ","Arizona"],["WV","West Virginia"],
  ["AR","Arkansas"],["IA","Iowa"],["OK","Oklahoma"],["WI","Wisconsin"],
];
const apply=process.argv.includes("--apply");
if(apply && (process.env.JURISDICTION_SEED_ALLOW_WRITE!=="1" || !process.env.JURISDICTION_SEED_DATABASE_CONFIRMED))throw Error("Set write opt-in and exact confirmed database name before writing");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
const report=[];
try{
 await client.query("BEGIN");
 if(apply){const db=await client.query("SELECT current_database() AS name");if(db.rows[0].name!==process.env.JURISDICTION_SEED_DATABASE_CONFIRMED)throw Error("Database identity mismatch");}
 for(const [regionCode,name] of states){
  const j=await client.query("SELECT id,code FROM jurisdictions WHERE region_code=$1 OR code=ANY($2::text[]) ORDER BY CASE WHEN region_code=$1 THEN 0 ELSE 1 END LIMIT 1",[regionCode,[regionCode,`US-${regionCode}`,`US_${regionCode}`]]);
  if(!j.rowCount){report.push({state:regionCode,status:"jurisdiction_missing"});continue;}
  const profile={
   schemaVersion:1,
   editorial:{reviewState:"needs_research",verificationStatus:"unverified",ownerTeam:"CAN compliance",researchPriority:"initial",lastVerifiedAt:null,nextReviewAt:null,reviewerId:null},
   summary:`CAN is preparing a state profile for ${name}. Operating eligibility, funding programs, and legal requirements are pending verification.`,
   operatingModels:[],
   fundingPrograms:[],
   requirements:[],
   responsibilities:{can:[],church:[],family:[]},
   academicPolicy:{creditRecognition:"unverified",graduationRequirements:[],assessmentRequirements:[]},
   operations:{attendance:[],staffing:[],safeguarding:[],records:[],reporting:[],calendar:[]},
   researchQueue:[
    {topic:"school_of_record",status:"unresearched",sourceUrls:[]},
    {topic:"church_hosted_programs",status:"unresearched",sourceUrls:[]},
    {topic:"homeschool",status:"unresearched",sourceUrls:[]},
    {topic:"education_savings_accounts_and_vouchers",status:"unresearched",sourceUrls:[]},
    {topic:"provider_registration",status:"unresearched",sourceUrls:[]},
    {topic:"attendance_and_records",status:"unresearched",sourceUrls:[]},
    {topic:"staffing_and_safety",status:"unresearched",sourceUrls:[]},
    {topic:"credit_and_assessment",status:"unresearched",sourceUrls:[]},
   ],
  };
  const existing=await client.query("SELECT id,status FROM jurisdiction_profile_versions WHERE jurisdiction_id=$1 AND revision='bootstrap-1'",[j.rows[0].id]);
  if(existing.rowCount){report.push({state:regionCode,status:"already_exists",reviewStatus:existing.rows[0].status});continue;}
  if(apply)await client.query(`INSERT INTO jurisdiction_profile_versions (jurisdiction_id,revision,status,title,summary,profile,evidence)
   VALUES ($1,'bootstrap-1','in_review',$2,$3,$4::jsonb,'[]'::jsonb)`,
   [j.rows[0].id,`${name} education jurisdiction profile`,profile.summary,JSON.stringify(profile)]);
  report.push({state:regionCode,status:apply?"created_in_review":"would_create_in_review"});
 }
 if(apply)await client.query("COMMIT");else await client.query("ROLLBACK");
 console.log(JSON.stringify({apply,report},null,2));
}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();await pool.end();}
