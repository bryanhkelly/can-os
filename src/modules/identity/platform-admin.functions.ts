import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accessAdultLearningReviews } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";

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
    if (actor.role !== "app_admin" || actor.sessionAccountId ||
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
        EXISTS(SELECT 1 FROM education_v30.deployment_sites ds
          WHERE ds.site_id=s.id) AS "hasDeliveryAssignment",
        COALESCE(s.lifecycle_status,'unclassified') AS "siteLifecycle"
      FROM public.sites s
      ORDER BY s.name, s.id
      LIMIT 100
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
    return {
      reviewedAdultIdentityReady,
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
