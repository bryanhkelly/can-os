import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accessAccountFavoriteSites, organizations, people,
  sitePublications, sites,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { accountPersonNeedsReview, canBookmarkSite, canSavePublishedSite } from "@/domain/my-can-account";
import { getCommandContext } from "./command-context.server";
import { readSessionGrants } from "./session-grants.server";
import { publicSiteHost } from "@/domain/public-site-address";

/**
 * Account-level read, independent of the currently selected school Site.
 * A verified active session is mandatory; a bookmark is never a grant.
 */
function favoriteTableNotInstalled(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    const details = current as { code?: string; message?: string; cause?: unknown };
    if (details.code === "42P01" && details.message?.includes("access_account_favorite_sites")) return true;
    current = details.cause;
  }
  return false;
}

export const getMyCanAccount = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  const accountId = actor.sessionAccountId ?? actor.accountId;
  if (!actor.actorPersonId) throw new AuthorizationError("verified account holder");
  const [account, person] = await Promise.all([
    db.select({
      email: accessAccounts.emailNormalized,
      emailVerifiedAt: accessAccounts.emailVerifiedAt,
    }).from(accessAccounts).where(and(
      eq(accessAccounts.id, accountId),
      eq(accessAccounts.disabled, false),
    )).limit(1),
    db.select({
      firstName: people.legalFirstName,
      lastName: people.legalLastName,
      preferredName: people.preferredName,
      phone: people.phone,
    }).from(people).where(and(eq(people.id, actor.actorPersonId), eq(people.active, true))).limit(1),
  ]);
  if (!account[0] || !person[0]) throw new AuthorizationError("active verified identity");

  const { grants, demoAccountSwitching } = await readSessionGrants(accountId, account[0].email);
  if (!grants.some(grant => grant.id === actor.grantId && grant.active)) {
    throw new AuthorizationError("active account membership");
  }

  const siteIds = [...new Set([...grants.map(grant => grant.siteId), ...(actor.scope.siteIds ?? [])].filter((id): id is string => !!id))];
  const organizationIds = [...new Set(grants.map(grant => grant.organizationId).filter((id): id is string => !!id))];
  const [workspaceSites, workspaceOrgs] = await Promise.all([
    siteIds.length ? db.select({
      id: sites.id, name: sites.name, address: sites.address,
      organizationName: organizations.name, slug: sitePublications.slug,
      status: sitePublications.status, publishedAt: sitePublications.publishedAt,
    }).from(sites)
      .innerJoin(organizations, eq(sites.organizationId, organizations.id))
      .leftJoin(sitePublications, eq(sites.id, sitePublications.siteId))
      .where(inArray(sites.id, siteIds)) : Promise.resolve([]),
    organizationIds.length ? db.select({ id: organizations.id, name: organizations.name })
      .from(organizations).where(inArray(organizations.id, organizationIds)) : Promise.resolve([]),
  ]);
  const workspaces = grants.map(grant => ({
    grantId: grant.id,
    role: grant.role,
    personName: [grant.firstName, grant.lastName].filter(Boolean).join(" "),
    place: workspaceSites.find(site => site.id === grant.siteId)?.name
      ?? workspaceOrgs.find(org => org.id === grant.organizationId)?.name
      ?? "CAN OS",
    active: grant.id === actor.grantId,
  }));

  // The first 100 published Sites form a bounded directory; favorites are
  // queried independently so a saved Site is not lost when the directory grows.
  const placeResult = await db.transaction(async tx => {
    await tx.execute(sql`SELECT set_config('can.account_id', ${accountId}, true)`);
    const directory = await tx.select({
        id: sites.id, name: sites.name, address: sites.address,
        organizationName: organizations.name, slug: sitePublications.slug,
        status: sitePublications.status, publishedAt: sitePublications.publishedAt,
      }).from(sitePublications)
        .innerJoin(sites, eq(sitePublications.siteId, sites.id))
        .innerJoin(organizations, eq(sites.organizationId, organizations.id))
        .where(and(eq(sitePublications.status, "published"),
          isNotNull(sitePublications.publishedAt)))
        .orderBy(asc(sites.name)).limit(100);
    const savedSites = await tx.select({
      id: sites.id, name: sites.name, address: sites.address,
      organizationName: organizations.name, slug: sitePublications.slug,
      status: sitePublications.status, publishedAt: sitePublications.publishedAt,
    }).from(accessAccountFavoriteSites)
      .innerJoin(sites, eq(accessAccountFavoriteSites.siteId, sites.id))
      .innerJoin(organizations, eq(sites.organizationId, organizations.id))
      .leftJoin(sitePublications, eq(sites.id, sitePublications.siteId))
      .where(eq(accessAccountFavoriteSites.accountId, accountId)).limit(500);
    const favoriteIds = new Set(savedSites.map(row => row.id));
    // Show favorites outside the first page of public results, but never
    // expose an unpublished private Site after the last verified grant ends.
    const allowedSaved = savedSites.filter(row =>
      siteIds.includes(row.id) || canSavePublishedSite({
        status: row.status ?? "", publishedAt: row.publishedAt,
      }));
    const bySite = new Map([...directory, ...workspaceSites, ...allowedSaved]
      .map(row => [row.id, row]));
    return [...bySite.values()].map(site => ({
      id: site.id, name: site.name, organizationName: site.organizationName,
      city: typeof site.address?.city === "string" ? site.address.city : null,
      region: typeof site.address?.region === "string" ? site.address.region : null,
      url: site.slug && canSavePublishedSite({
        status: site.status ?? "", publishedAt: site.publishedAt,
      }) ? `https://${publicSiteHost(site.slug)}/` : null,
      favorite: favoriteIds.has(site.id),
      workspaceSite: siteIds.includes(site.id),
    })).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }).then(places => ({ places, favoritesReady: true }))
    .catch((error: unknown) => {
      if (favoriteTableNotInstalled(error)) return { places: [], favoritesReady: false };
      throw error;
    });

  return {
    email: account[0].email,
    verified: !!account[0].emailVerifiedAt,
    displayName: person[0].preferredName || person[0].firstName,
    fullName: [person[0].firstName, person[0].lastName].join(" "),
    profile: { preferredName: person[0].preferredName ?? "", phone: person[0].phone ?? "" },
    demoAccountSwitching,
    workspaces, places: placeResult.places, favoritesReady: placeResult.favoritesReady,
    identityNeedsReview: accountPersonNeedsReview(grants, demoAccountSwitching),
  };
});

const favoriteCommand = z.object({
  siteId: z.string().uuid(),
  favorite: z.boolean(),
}).strict();

/** Save/remove bookmark for the signed-in account; never trust a submitted account ID. */
export const setMyCanFavoriteSite = createServerFn({ method: "POST" })
  .validator((value: unknown) => favoriteCommand.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const accountId = actor.sessionAccountId ?? actor.accountId;
    if (!actor.actorPersonId) throw new AuthorizationError("verified account holder");
    const [account] = await db.select({ email: accessAccounts.emailNormalized })
      .from(accessAccounts).where(and(eq(accessAccounts.id, accountId),
        eq(accessAccounts.disabled, false))).limit(1);
    if (!account) throw new AuthorizationError("active account");
    const { grants } = await readSessionGrants(accountId, account.email);
    if (!grants.some(grant => grant.id === actor.grantId && grant.active))
      throw new AuthorizationError("active membership");
    const authorizedSites = new Set([
      ...(actor.scope.siteIds ?? []),
      ...grants.map(grant => grant.siteId).filter((id): id is string => !!id),
    ]);
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT set_config('can.account_id', ${accountId}, true)`);
      if (data.favorite) {
        const [published] = await tx.select({ id: sitePublications.siteId, status: sitePublications.status, publishedAt: sitePublications.publishedAt })
          .from(sitePublications)
          .where(eq(sitePublications.siteId, data.siteId)).limit(1);
        if (!canBookmarkSite({ siteId: data.siteId, authorizedSiteIds: authorizedSites, publication: published }))
          throw new AuthorizationError("published or authorized Site");
        await tx.insert(accessAccountFavoriteSites).values({
          accountId, siteId: data.siteId,
        }).onConflictDoNothing();
      } else {
        await tx.delete(accessAccountFavoriteSites).where(and(
          eq(accessAccountFavoriteSites.accountId, accountId),
          eq(accessAccountFavoriteSites.siteId, data.siteId),
        ));
      }
      return { favorite: data.favorite };
    });
  });
