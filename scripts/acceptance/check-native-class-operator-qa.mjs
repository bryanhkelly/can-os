#!/usr/bin/env node
/** Read-only prerequisite check for a real operator-created Class on isolated QA.
 * This does NOT create credentials, adoptions, Courses, Classes, or approvals.
 * A passing check never substitutes for authenticated browser acceptance. */
import { neon } from "@neondatabase/serverless";
import { verifyAdmissionsNeonBranch } from "../verify-admissions-neon-branch.mjs";

const env=process.env;
const required=(key)=>{
  const value=env[key];
  if(!value)throw new Error("Native Class operator QA missing "+key);
  return value;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function main(){
  if(env.APP_ENV!=="test"||env.NODE_ENV!=="test"||
    env.CAN_CLASS_OPERATOR_QA_RUN!=="1"||
    env.CAN_TEST_DB_WRITES_ENABLED!=="true")
    throw new Error("Class operator QA requires explicit test-only activation");
  const url=required("TEST_DATABASE_URL");
  if(env.DATABASE_URL!==url)
    throw new Error("Application and QA must share one explicitly isolated test database");
  const branch=required("CAN_E2E_TEST_BRANCH_ID");
  const siteId=required("CAN_CLASS_OPERATOR_QA_SITE_ID");
  if(!uuid.test(siteId))throw new Error("A real platform QA Site UUID is required");
  required("CAN_CLASS_OPERATOR_QA_SECRET");
  await verifyAdmissionsNeonBranch({
    ...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch,
  });
  const sql=neon(url);
  const [row]=await sql`
    SELECT
      EXISTS(SELECT 1 FROM education_v30.course_versions
        WHERE lifecycle='published' AND published_at IS NOT NULL) AS published_course,
      EXISTS(SELECT 1 FROM education_v30.deployment_offering_adoptions
        WHERE approval_status='approved') AS approved_adoption,
      EXISTS(SELECT 1 FROM public.sites WHERE id=${siteId}::uuid)
        AS has_site
  `;
  if(!row?.published_course||!row.approved_adoption||!row.has_site)
    throw new Error("QA missing a real published Course, approved adoption, or platform Site");
  console.log(JSON.stringify({
    readOnly:true,branchId:branch,
    publishedCourseAvailable:true,approvedAdoptionAvailable:true,
    requestedSiteExists:true,
    next:"Use the real Class manager in a signed-in QA browser. Source availability does not grant current operator rights.",
  }));
}
main().catch(error=>{
  console.error("Native Class operator QA preflight failed:",error.message);
  process.exitCode=1;
});
