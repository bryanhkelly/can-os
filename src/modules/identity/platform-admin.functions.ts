import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accessAdultLearningReviews } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import academicIntegritySql from "../../../scripts/acceptance/academic-integrity-inventory.sql?raw";

/**
 * Platform administration is an independently provisioned, account-wide
 * membership. It never inherits a school's staff or canonical Blueprint role.
 * Every endpoint must recheck the current session and exact platform grant.
 */
export const readPlatformAdminOverview = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    assertCapability(actor, "platform.admin");
    if (!["app_admin","platform_owner"].includes(actor.role) || actor.sessionAccountId ||
        !actor.accountId || actor.grantSiteId ||
        (actor.scope.organizationIds?.length ?? 0) > 0 ||
        (actor.scope.siteIds?.length ?? 0) > 0) {
      throw new AuthorizationError("independently scoped platform administrator");
    }
    const [account] = await db.select({
      verifiedAt: accessAccounts.emailVerifiedAt,
      disabled: accessAccounts.disabled,
      email: accessAccounts.emailNormalized,
    }).from(accessAccounts).where(eq(accessAccounts.id, actor.accountId)).limit(1);
    if (!account?.verifiedAt || account.disabled || isDemoAccountEmail(account.email)) {
      throw new AuthorizationError("verified non-demo platform administrator");
    }

    // Aggregate-only first surface; no learner, family, or staff identities.
    const summary = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM public.organizations) AS organizations,
        (SELECT count(*)::int FROM public.sites) AS sites,
        (SELECT count(*)::int FROM public.account_person_grants
         WHERE role = 'app_admin' AND active = true
           AND organization_id IS NULL AND site_id IS NULL) AS active_platform_admins
    `);
    const row = summary.rows[0];
    // Diagnostic only: one platform Site UUID. Native Class provisioning
    // does not create another identity and never grants operator authority.
    const siteRows = await db.execute(sql`
      SELECT s.id AS "siteId", s.name AS "siteName",
        EXISTS(SELECT 1 FROM public.deployment_sites ds
          WHERE ds.site_id=s.id) AS "hasDeliveryAssignment",
        COALESCE(s.lifecycle_status,'unclassified') AS "siteLifecycle"
      FROM public.sites s
      ORDER BY s.name, s.id
      LIMIT 100
    `);
    // Read-only publisher readiness inventory. It does not expose names,
    // email addresses, grant IDs or evidence documents, and does not confer
    // Course appointment, independent review or local adoption authority.
    // A record's presence is not a current authorization decision.
    const publisherReleaseRows=await db.execute(sql`
      SELECT ov.id AS "offeringVersionId",o.title AS "offeringTitle",
        o.code AS "offeringCode",ov.version_no AS "versionNo",ov.lifecycle,
        training.state AS "noncreditTrainingStatus",
        assessment.lifecycle AS "noncreditAssessmentStatus",
        (training.approved_by_person_id IS NOT NULL) AS "noncreditTrainingApproved",
        (SELECT count(*)::int FROM public.offering_courses oc
          JOIN public.course_lessons cl ON cl.course_version_id=oc.course_version_id
          WHERE oc.offering_version_id=ov.id) AS "pilotLessonCount",
        (SELECT count(*)::int FROM public.offering_courses oc
          JOIN public.course_lessons cl ON cl.course_version_id=oc.course_version_id
          WHERE oc.offering_version_id=ov.id AND cl.content->>'placeholder'='true')
          AS "pilotPlaceholderCount",
        (SELECT count(*)::int FROM public.offering_courses oc
          JOIN public.course_lessons cl ON cl.course_version_id=oc.course_version_id
          WHERE oc.offering_version_id=ov.id AND
            (cl.content->>'requiresPartnerContentApproval'='true' OR
             cl.content->>'requiresIndependentReview'='true'))
          AS "pilotContentReviewCount",
        (SELECT count(*)::int FROM public.offering_courses oc JOIN public.course_lessons cl ON cl.course_version_id=oc.course_version_id
          WHERE oc.offering_version_id=ov.id AND cl.content->>'assessmentStatus'='not_published') AS "pilotAssessmentPendingCount",
        (SELECT count(*)::int FROM public.noncredit_completion_policies p WHERE p.training_version_id=training.id AND p.published_at IS NOT NULL AND p.approved_by_person_id IS NOT NULL AND p.effective_at<=now()) AS "completionPolicies",
        (SELECT count(*)::int FROM public.noncredit_self_enrollment_releases r WHERE r.training_version_id=training.id AND r.offering_version_id=ov.id AND r.status='published') AS "registrationListings",
        (SELECT count(*)::int FROM public.noncredit_self_enrollment_releases r WHERE r.training_version_id=training.id AND r.offering_version_id=ov.id AND r.status='published' AND r.opens_at<=now() AND r.closes_at>now()) AS "openRegistrationListings",
        (SELECT count(*)::int FROM public.offering_courses oc
          WHERE oc.offering_version_id=ov.id) AS "courseCount",
        (SELECT count(*)::int FROM public.offering_courses oc
          JOIN public.course_versions cv ON cv.id=oc.course_version_id
          WHERE oc.offering_version_id=ov.id
            AND cv.lifecycle='published' AND cv.published_at IS NOT NULL)
          AS "publishedCourses",
        (SELECT count(DISTINCT g.person_id)::int FROM public.account_person_grants g
          JOIN public.access_accounts a ON a.id=g.account_id
          JOIN public.people p ON p.id=g.person_id
          WHERE g.organization_id=o.publisher_organization_id
            AND g.site_id IS NULL AND g.active AND p.active
            AND a.person_id=g.person_id AND NOT a.disabled
            AND a.email_verified_at IS NOT NULL
            AND g.role='academic_content_creator') AS "creatorMemberships",
        (SELECT count(DISTINCT g.person_id)::int FROM public.account_person_grants g
          JOIN public.access_accounts a ON a.id=g.account_id
          JOIN public.people p ON p.id=g.person_id
          WHERE g.organization_id=o.publisher_organization_id
            AND g.site_id IS NULL AND g.active AND p.active
            AND a.person_id=g.person_id AND NOT a.disabled
            AND a.email_verified_at IS NOT NULL
            AND g.role='academic_content_reviewer') AS "reviewerMemberships",
        (SELECT count(DISTINCT a.course_id)::int
          FROM public.offering_courses oc
          JOIN public.course_versions cv ON cv.id=oc.course_version_id
          JOIN public.professional_role_assignments a ON a.course_id=cv.course_id
          WHERE oc.offering_version_id=ov.id
            AND a.organization_id=o.publisher_organization_id
            AND a.appointing_organization_id=o.publisher_organization_id
            AND a.role_code='academic_content_creator' AND a.state='approved'
            AND a.begins_at<=clock_timestamp()
            AND (a.ends_at IS NULL OR a.ends_at>clock_timestamp()))
          AS "creatorAppointedCourses",
        (SELECT count(DISTINCT a.course_id)::int
          FROM public.offering_courses oc
          JOIN public.course_versions cv ON cv.id=oc.course_version_id
          JOIN public.professional_role_assignments a ON a.course_id=cv.course_id
          WHERE oc.offering_version_id=ov.id
            AND a.organization_id=o.publisher_organization_id
            AND a.appointing_organization_id=o.publisher_organization_id
            AND a.role_code='academic_content_reviewer' AND a.state='approved'
            AND a.begins_at<=clock_timestamp()
            AND (a.ends_at IS NULL OR a.ends_at>clock_timestamp()))
          AS "reviewerAppointedCourses",
        (SELECT count(*)::int
          FROM public.evidence_document_versions v
          JOIN public.evidence_documents d ON d.id=v.document_id
          WHERE d.owning_organization_id=o.publisher_organization_id
            AND v.verified_by_person_id IS NOT NULL AND v.verified_at IS NOT NULL
            AND v.verified_at<=clock_timestamp()
            AND (v.valid_from IS NULL OR v.valid_from<=CURRENT_DATE)
            AND (v.valid_through IS NULL OR v.valid_through>=CURRENT_DATE))
          AS "currentEvidenceRecords",
        (SELECT count(*)::int FROM public.offering_release_requirements r
          WHERE r.offering_version_id=ov.id) AS "releasePolicies",
        (SELECT m.manifest_status FROM public.content_publication_manifests m
          WHERE m.offering_version_id=ov.id
          ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS "manifestStatus",
        (SELECT count(*)::int FROM public.content_publication_manifest_items i
          WHERE i.manifest_id=(
            SELECT m.id FROM public.content_publication_manifests m
            WHERE m.offering_version_id=ov.id
            ORDER BY m.created_at DESC,m.id DESC LIMIT 1)) AS "releaseAssets",
        (SELECT count(*)::int FROM public.deployment_offering_adoptions a
          WHERE a.offering_version_id=ov.id AND a.approval_status='approved')
          AS "approvedAdoptions"
      FROM public.offering_versions ov
      JOIN public.offerings o ON o.id=ov.offering_id
      LEFT JOIN public.noncredit_training_versions training ON training.offering_version_id=ov.id
      LEFT JOIN public.assessment_versions assessment ON assessment.id=training.assessment_version_id
      ORDER BY CASE WHEN o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01') THEN 0 ELSE 1 END,
        o.title,ov.version_no DESC,ov.id
      LIMIT 26
    `);
    // Keep the sensitive review UI unavailable until the approved QA/prod
    // migration has been applied with forced RLS.
    const reviewReadiness=await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='access_adult_learning_reviews'
          AND c.relrowsecurity AND c.relforcerowsecurity
      ) AS ready
    `);
    const reviewedAdultIdentityReady=reviewReadiness.rows[0]?.ready===true;
    // Operator reconciliation without displaying DOB, identity documents
    // or private verification metadata. The review itself remains immutable.
    const reviewCases=reviewedAdultIdentityReady
      ?await db.select({
        accessAccountId:accessAdultLearningReviews.accessAccountId,
        status:accessAdultLearningReviews.status,
        reviewedAt:accessAdultLearningReviews.reviewedAt,
        consumedAt:accessAdultLearningReviews.consumedAt,
        nativeAccountId:accessAdultLearningReviews.canonicalAccountId,
      }).from(accessAdultLearningReviews)
        .orderBy(desc(accessAdultLearningReviews.reviewedAt)).limit(50)
      :[];
    // Aggregate inventory only, behind the independently verified platform grant.
    // A failed diagnostic must not prevent the remaining admin workflows.
    const academicIntegrity = await db.execute(sql.raw(academicIntegritySql)).then(result => ({
      status: "available" as const,
      checkedAt: new Date().toISOString(),
      findings: result.rows.map(item => ({code:String(item.code),priority:String(item.priority),
        siteId:item.site_id == null ? null : String(item.site_id),
        siteName:item.site_name == null ? "Unassigned Site" : String(item.site_name), affected:Number(item.affected)})),
    })).catch(() => ({status:"unavailable" as const,checkedAt:new Date().toISOString(),findings:[]}));
    return {
      academicIntegrity,
      platformOwner: actor.role === "platform_owner",
      reviewedAdultIdentityReady,
      publisherReleasesLimited:publisherReleaseRows.rows.length>25,
      publisherReleaseReadiness:publisherReleaseRows.rows.slice(0,25).map(row=>({
        offeringVersionId:String(row.offeringVersionId),
        offeringCode: String(row.offeringCode??""),
        noncreditTrainingStatus: row.noncreditTrainingStatus===null?null:String(row.noncreditTrainingStatus),
        noncreditAssessmentStatus: row.noncreditAssessmentStatus===null?null:String(row.noncreditAssessmentStatus),
        noncreditTrainingApproved: row.noncreditTrainingApproved===true,
        pilotLessonCount: Number(row.pilotLessonCount??0),
        pilotPlaceholderCount: Number(row.pilotPlaceholderCount??0),
        pilotContentReviewCount: Number(row.pilotContentReviewCount??0),
        pilotAssessmentPendingCount: Number(row.pilotAssessmentPendingCount??0),
        completionPolicies: Number(row.completionPolicies??0),
        registrationListings: Number(row.registrationListings??0),
        openRegistrationListings: Number(row.openRegistrationListings??0),
        offeringTitle:String(row.offeringTitle),
        versionNo:Number(row.versionNo),
        lifecycle:String(row.lifecycle),
        courseCount:Number(row.courseCount??0),
        publishedCourses:Number(row.publishedCourses??0),
        creatorMemberships:Number(row.creatorMemberships??0),
        reviewerMemberships:Number(row.reviewerMemberships??0),
        creatorAppointedCourses:Number(row.creatorAppointedCourses??0),
        reviewerAppointedCourses:Number(row.reviewerAppointedCourses??0),
        currentEvidenceRecords:Number(row.currentEvidenceRecords??0),
        releasePolicies:Number(row.releasePolicies??0),
        manifestStatus:row.manifestStatus===null?null:String(row.manifestStatus),
        releaseAssets:Number(row.releaseAssets??0),
        approvedAdoptions:Number(row.approvedAdoptions??0),
      })),
      reviewCases:reviewCases.map(record=>({
        accessAccountId:record.accessAccountId,
        status:record.status==="revoked"?"revoked":
          record.consumedAt?"active":"approved_pending_activation",
        reviewedAt:record.reviewedAt.toISOString(),
        activated:Boolean(record.nativeAccountId),
      })),
      organizations: Number(row?.organizations ?? 0),
      sites: Number(row?.sites ?? 0),
      activePlatformAdmins: Number(row?.active_platform_admins ?? 0),
      siteReadiness: siteRows.rows.map(item => ({
        siteId: String(item.siteId),
        siteName: String(item.siteName),
        hasDeliveryAssignment: item.hasDeliveryAssignment === true,
        siteLifecycle: String(item.siteLifecycle),
      })),
    };
  });
