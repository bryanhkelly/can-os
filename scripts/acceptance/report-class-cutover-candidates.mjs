#!/usr/bin/env node
/**
 * READ ONLY: candidate inventory for retiring legacy academic records.
 * Exact publisher/code/version equality is necessary to propose a candidate,
 * NEVER evidence that content or grading policies are equivalent.
 *
 * CAN_CLASS_CUTOVER_CANDIDATES=1 CAN_CLASS_CUTOVER_QA_DATABASE_URL=... \
 *   node scripts/acceptance/report-class-cutover-candidates.mjs
 *
 * Connects only to the pinned CAN OS test01 branch. Exports no learner names,
 * email addresses, or row-level attendance/submission evidence.
 * This report does not create Class records, mappings, or dual writes.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

assert.equal(process.env.CAN_CLASS_CUTOVER_CANDIDATES,"1",
  "Explicit CAN_CLASS_CUTOVER_CANDIDATES=1 required");
assert(process.env.CAN_CLASS_CUTOVER_QA_DATABASE_URL,
  "Isolated test01 CAN_CLASS_CUTOVER_QA_DATABASE_URL required");

const pool=new Pool({
  connectionString:process.env.CAN_CLASS_CUTOVER_QA_DATABASE_URL,
  max:1,connectionTimeoutMillis:3000,
});
const client=await pool.connect();
try{
  await client.query("BEGIN READ ONLY");
  const {rows:[branch]}=await client.query(
    "SELECT current_setting('neon.project_id',true) AS project_id, " +
    "current_setting('neon.branch_id',true) AS branch_id");
  assert.equal(branch?.project_id,"sweet-hall-62441909","Unexpected Neon project");
  assert.equal(branch?.branch_id,"br-bitter-feather-ar0u63x7",
    "Only isolated test01 may be inspected");

  const {rows}=await client.query(`
    SELECT s.id::text AS legacy_section_id,
      s.course_template_version_id::text AS legacy_course_version_id,
      s.site_id::text AS legacy_site_id,
      s.program_id::text AS legacy_program_id,
      ctv.version AS legacy_version_number,
      ctv.status::text AS legacy_publication_status,
      (SELECT count(*)::int FROM public.enrollments e
        WHERE e.section_id=s.id) AS enrollment_count,
      (SELECT count(*)::int FROM public.assessments a
        WHERE a.section_id=s.id) AS assessment_count,
      (SELECT count(*)::int FROM public.submissions sub
        JOIN public.assessments a ON a.id=sub.assessment_id
        WHERE a.section_id=s.id) AS submission_count,
      (SELECT count(*)::int FROM public.scheduled_occurrences so
        WHERE so.section_id=s.id) AS scheduled_occurrence_count,
      (SELECT count(*)::int FROM public.section_grades g
        WHERE g.section_id=s.id) AS grade_count,
      (SELECT count(*)::int FROM public.lesson_progress lp
        WHERE lp.section_id=s.id) AS lesson_progress_count,
      (SELECT count(DISTINCT cv.id)::int
        FROM education_v30.courses nc
        JOIN public.course_versions cv ON cv.course_id=nc.id
        WHERE nc.course_code=ct.code
          AND nc.publisher_organization_id=ct.owning_organization_id
          AND cv.lifecycle='published'
          AND cv.version_no=ctv.version) AS exact_candidate_version_count
    FROM public.sections s
    JOIN public.course_template_versions ctv
      ON ctv.id=s.course_template_version_id
    JOIN public.course_templates ct
      ON ct.id=ctv.course_template_id
    ORDER BY s.id
  `);

  const entries=rows.map(row=>{
    const matchCount=Number(row.exact_candidate_version_count);
    return {
      ...row,
      exact_candidate_version_count:matchCount,
      state:matchCount===0?"missing_candidate":
        matchCount>1?"ambiguous_candidate":"content_equivalence_review_required",
    };
  });
  const totals=Object.fromEntries([
    "enrollment_count","assessment_count","submission_count",
    "scheduled_occurrence_count","grade_count","lesson_progress_count",
  ].map(key=>[key,entries.reduce((n,row)=>n+Number(row[key]),0)]));
  const result={
    target:"test01",
    purpose:"candidate inventory, not a migration authorization",
    source_classes:entries.length,totals,
    missing_candidates:entries.filter(e=>e.state==="missing_candidate").length,
    ambiguous_candidates:entries.filter(e=>e.state==="ambiguous_candidate").length,
    content_review_required:entries.filter(e=>e.state==="content_equivalence_review_required").length,
    entries,
    can_auto_migrate:false,
    note:"No guessing Person IDs, Class IDs, Course versions, credit or grades. Human-reviewed source-to-native evidence and transactions remain mandatory.",
  };
  console.log(JSON.stringify(result,null,2));
  await client.query("ROLLBACK");
  // An evidence inventory intentionally cannot certify automated migration.
  process.exitCode=entries.length?2:0;
}catch(error){
  await client.query("ROLLBACK").catch(()=>{});
  throw error;
}finally{
  client.release();
  await pool.end();
}
