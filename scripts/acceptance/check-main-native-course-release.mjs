#!/usr/bin/env node
/**
 * Read-only, main-only CAN OS native Course/Offering publication preflight.
 * Never provisions a Person, grants authority, publishes content, adopts an
 * Offering or writes evidence.
 *
 * CAN_MAIN_NATIVE_RELEASE_CHECK=1 DATABASE_URL=<main-neon-url> \
 *   node scripts/acceptance/check-main-native-course-release.mjs --strict
 *
 * Optional: --offering-version=<uuid>
 */
import { neon } from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const DEFAULT_OFFERING="ca270000-0000-4000-8000-000000000051";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function arg(name){
  const options=process.argv.filter(value=>value.startsWith(name+"="));
  if(options.length>1)throw new Error("Duplicate "+name+" argument");
  return options.length?options[0].slice(name.length+1):null;
}
const offeringVersionId=arg("--offering-version")??DEFAULT_OFFERING;
if(!uuid.test(offeringVersionId))throw new Error("A valid Offering version UUID is required.");
if(process.env.CAN_MAIN_NATIVE_RELEASE_CHECK!=="1")
  throw new Error("CAN_MAIN_NATIVE_RELEASE_CHECK=1 is required for read-only production preflight.");
if(!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL must explicitly target CAN OS Neon main.");

async function main(){
  const url=new URL(process.env.DATABASE_URL);
  if(!["postgres:","postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL connection.");
  const sql=neon(url.toString());
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) project,
      current_setting('neon.branch_id',true) branch,
      current_database() database
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN||target?.database!=="neondb")
    throw new Error("Refusing any database other than the verified CAN OS Neon main.");

  const [offering]=await sql`
    SELECT ov.id,ov.version_no,ov.lifecycle,ov.published_at,
      o.title,o.status,o.publisher_organization_id,o.id AS offering_id
    FROM education_v30.offering_versions ov
    JOIN education_v30.offerings o ON o.id=ov.offering_id
    WHERE ov.id=${offeringVersionId}::uuid
  `;
  if(!offering)throw new Error("Specified native Offering version does not exist on main.");

  const courses=await sql`
    SELECT c.id course_id,c.course_code,cv.id course_version_id,
      cv.lifecycle,cv.published_at,oc.is_required,
      (SELECT count(*)::int FROM education_v30.course_lessons l
       WHERE l.course_version_id=cv.id) lesson_count
    FROM education_v30.offering_courses oc
    JOIN education_v30.course_versions cv ON cv.id=oc.course_version_id
    JOIN education_v30.courses c ON c.id=cv.course_id
    WHERE oc.offering_version_id=${offeringVersionId}::uuid
      AND c.publisher_organization_id=${offering.publisher_organization_id}::uuid
    ORDER BY oc.sequence_no,cv.id
    LIMIT 51
  `;

  // A live Course appointment requires a verified *public* Person and CAN
  // account, one organization-wide active grant, specific approved professional
  // assignment, current capability approval, and verified supporting evidence.
  // Returning only role/course identity here; no names, emails or Person IDs
  // are included in the serialized report.
  const eligible=await sql`
    SELECT DISTINCT a.course_id,a.person_id,a.role_code
    FROM education_v30.professional_role_assignments a
    JOIN education_v30.professional_capability_authorizations ca
      ON ca.id=a.capability_authorization_id
      AND ca.person_id=a.person_id AND ca.capability_id=a.capability_id
    JOIN education_v30.service_capabilities capability
      ON capability.id=a.capability_id
    JOIN education_v30.evidence_document_versions authority
      ON authority.id=a.authority_evidence_id
    JOIN public.account_person_grants g ON g.person_id=a.person_id
      AND g.organization_id=a.organization_id AND g.role=a.role_code
      AND g.site_id IS NULL AND g.active
    JOIN public.people p ON p.id=g.person_id AND p.active
    JOIN public.access_accounts acc ON acc.id=g.account_id
      AND acc.person_id=g.person_id AND NOT acc.disabled
      AND acc.email_verified_at IS NOT NULL
    WHERE a.course_id IN (
      SELECT cv.course_id FROM education_v30.course_versions cv
      JOIN education_v30.offering_courses oc ON oc.course_version_id=cv.id
      WHERE oc.offering_version_id=${offeringVersionId}::uuid
    )
      AND a.organization_id=${offering.publisher_organization_id}::uuid
      AND a.appointing_organization_id=${offering.publisher_organization_id}::uuid
      AND a.role_code IN ('academic_content_creator','academic_content_reviewer')
      AND a.state='approved' AND a.begins_at<=clock_timestamp()
      AND (a.ends_at IS NULL OR a.ends_at>clock_timestamp())
      AND a.operation_id IS NULL AND a.deployment_id IS NULL
      AND a.section_id IS NULL AND a.learner_id IS NULL
      AND a.offering_id IS NULL
      AND ca.decision='approved' AND ca.valid_from<=clock_timestamp()
      AND (ca.valid_through IS NULL OR ca.valid_through>clock_timestamp())
      AND ca.geographic_area_id IS NULL
      AND ca.operation_id IS NULL AND ca.offering_id IS NULL
      AND capability.code=CASE WHEN a.role_code='academic_content_creator'
        THEN 'curriculum_author' ELSE 'content_reviewer' END
      AND authority.verified_at IS NOT NULL
      AND authority.verified_by_person_id IS NOT NULL
      AND authority.verified_at<=clock_timestamp()
      AND (authority.valid_from IS NULL OR authority.valid_from<=CURRENT_DATE)
      AND (authority.valid_through IS NULL OR authority.valid_through>=CURRENT_DATE)
      AND (ca.evidence_version_id IS NULL OR EXISTS(
        SELECT 1 FROM education_v30.evidence_document_versions ev
        WHERE ev.id=ca.evidence_version_id AND ev.verified_at IS NOT NULL
          AND ev.verified_by_person_id IS NOT NULL
          AND ev.verified_at<=clock_timestamp()
          AND (ev.valid_from IS NULL OR ev.valid_from<=CURRENT_DATE)
          AND (ev.valid_through IS NULL OR ev.valid_through>=CURRENT_DATE)
      ))
  `;

  const [identity]=await sql`
    SELECT
      (SELECT count(*)::int FROM public.people) public_people,
      (SELECT count(*)::int FROM education_v30.persons) legacy_people,
      (SELECT count(*)::int FROM public.account_person_grants
       WHERE organization_id=${offering.publisher_organization_id}::uuid
         AND active AND site_id IS NULL AND
         role='academic_content_creator') creator_grants,
      (SELECT count(*)::int FROM public.account_person_grants
       WHERE organization_id=${offering.publisher_organization_id}::uuid
         AND active AND site_id IS NULL AND
         role='academic_content_reviewer') reviewer_grants,
      (SELECT count(*)::int FROM education_v30.professional_role_assignments
       WHERE course_id IN (
         SELECT cv.course_id FROM education_v30.course_versions cv
         JOIN education_v30.offering_courses oc ON oc.course_version_id=cv.id
         WHERE oc.offering_version_id=${offeringVersionId}::uuid
       )) raw_appointments,
      (SELECT count(*)::int FROM pg_constraint con
       WHERE con.contype='f'
         AND con.confrelid='education_v30.persons'::regclass
         AND con.conrelid IN (
           'education_v30.professional_role_assignments'::regclass,
           'education_v30.professional_capability_authorizations'::regclass
         )) legacy_provider_person_fks
  `;
  const policies=await sql`
    SELECT course_version_id,minimum_approved_primary_tracks,
      complete_lesson_coverage_required,independent_academic_review_required,
      rights_clearance_required,accessibility_review_required
    FROM education_v30.offering_release_requirements
    WHERE offering_version_id=${offeringVersionId}::uuid
    ORDER BY course_version_id LIMIT 51
  `;
  const [manifest]=await sql`
    SELECT m.id,m.manifest_status,
      (SELECT count(*)::int FROM education_v30.content_publication_manifest_items i
       WHERE i.manifest_id=m.id) asset_uses,
      (SELECT count(DISTINCT d.review_kind)::int FROM (
        SELECT DISTINCT ON (review_kind) review_kind,decision
        FROM education_v30.content_manifest_review_decisions
        WHERE manifest_id=m.id ORDER BY review_kind,decision_order DESC
      ) d WHERE d.decision='approved') approved_review_categories
    FROM education_v30.content_publication_manifests m
    WHERE m.offering_version_id=${offeringVersionId}::uuid
    ORDER BY m.created_at DESC,m.id DESC LIMIT 1
  `;
  const deployments=await sql`
    SELECT adoption.approval_status, p.status deployment_status,
      o.status operation_status
    FROM education_v30.deployment_offering_adoptions adoption
    JOIN education_v30.program_deployments p ON p.id=adoption.deployment_id
    JOIN education_v30.education_operations o ON o.id=p.operation_id
    WHERE adoption.offering_version_id=${offeringVersionId}::uuid
    LIMIT 51
  `;

  const blockers=[];
  if(!courses.length||courses.length>50)
    blockers.push("Offering composition must have 1-50 bounded native Course versions.");
  if(identity.legacy_provider_person_fks)
    blockers.push("Professional Course grant foreign keys still reference the duplicate education_v30 Person.");
  const courseStatuses=courses.map(course=>{
    const creators=new Set(eligible.filter(a=>a.course_id===course.course_id
      &&a.role_code==="academic_content_creator").map(a=>a.person_id));
    const reviewers=new Set(eligible.filter(a=>a.course_id===course.course_id
      &&a.role_code==="academic_content_reviewer").map(a=>a.person_id));
    const independent=[...reviewers].some(reviewer=>
      [...creators].some(creator=>creator!==reviewer));
    if(!creators.size)blockers.push("Course "+course.course_code+": no live evidence-backed creator appointment.");
    if(!reviewers.size||!independent)blockers.push("Course "+course.course_code+": no independent live reviewer appointment.");
    if(!Number(course.lesson_count))blockers.push("Course "+course.course_code+": no authored native lessons.");
    if(course.lifecycle!=="published")blockers.push("Course "+course.course_code+": not independently published.");
    if(!policies.some(row=>row.course_version_id===course.course_version_id))
      blockers.push("Course "+course.course_code+": explicit Offering release policy missing.");
    return {courseCode:course.course_code,lifecycle:course.lifecycle,
      lessonCount:Number(course.lesson_count),creatorAppointments:creators.size,
      reviewerAppointments:reviewers.size,independentReviewerAvailable:independent};
  });
  if(offering.lifecycle!=="published")blockers.push("Offering version is not published.");
  if(!manifest)blockers.push("No submitted exact-version content manifest exists.");
  else {
    if(manifest.manifest_status!=="approved")blockers.push("Latest content manifest lacks independent approval.");
    if(!Number(manifest.asset_uses))blockers.push("Latest content manifest contains no reviewed assets.");
    if(Number(manifest.approved_review_categories)<5)
      blockers.push("Latest content manifest does not have all five approved review categories.");
  }
  if(!deployments.some(row=>row.approval_status==="approved"))
    blockers.push("No independently approved local Offering adoption exists.");
  const report={
    target:"CAN OS Neon main",readOnly:true,offeringVersionId,
    offering:{title:offering.title,lifecycle:offering.lifecycle,versionNo:offering.version_no},
    identity,courseStatuses,releasePolicies:policies.length,
    latestManifest:manifest?{
      status:manifest.manifest_status,assetUses:Number(manifest.asset_uses),
      approvedReviewCategories:Number(manifest.approved_review_categories),
    }:null,
    deployments:deployments.map(row=>({
      adoption:row.approval_status,deployment:row.deployment_status,
      operation:row.operation_status,
    })),
    state:blockers.length?"BLOCKED":"DATA_PREFLIGHT_ONLY",
    blockers,
    caveat:"Even a clean result is not a green authenticated browser, RLS, rollback or CI acceptance.",
  };
  console.log(JSON.stringify(report,null,2));
  if(blockers.length&&process.argv.includes("--strict"))process.exitCode=2;
}
main().catch(error=>{
  console.error("Native publisher main preflight refused:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});
