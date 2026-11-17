import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts } from "@/db/schema";
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
    // Platform-only operational diagnostic. No people, access tokens or
    // learner records are included. A missing link is not auto-approved.
    const siteRows = await db.execute(sql`
      SELECT s.id AS "siteId", s.name AS "siteName",
        COALESCE(link.status, 'not_requested') AS "linkStatus",
        CASE WHEN native.id IS NOT NULL THEN true ELSE false END AS "canonicalSiteExists"
      FROM public.sites s
      LEFT JOIN public.site_canonical_identity_links link
        ON link.public_site_id = s.id
      LEFT JOIN education_v30.sites native
        ON native.id = link.canonical_site_id
      ORDER BY s.name, s.id
      LIMIT 100
    `);
    return {
      organizations: Number(row?.organizations ?? 0),
      sites: Number(row?.sites ?? 0),
      activePlatformAdmins: Number(row?.active_platform_admins ?? 0),
      siteReadiness: siteRows.rows.map(item => ({
        siteId: String(item.siteId),
        siteName: String(item.siteName),
        linkStatus: String(item.linkStatus),
        canonicalSiteExists: item.canonicalSiteExists === true,
      })),
    };
  });
