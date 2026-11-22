import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, sites } from "@/db/schema";
import { assertWholeSiteReportingScope } from "@/domain/site-setup-scope";
import type { AccessContext } from "@/domain/access-context";

/** One reusable authorization boundary for Site-wide reporting consumers. */
export async function loadAuthorizedSiteReportingScope(
  reader: Pick<typeof db, "select">, actor: AccessContext, siteId: string,
): Promise<{id:string;organizationId:string}> {
  const [site] = await reader.select({
    id: sites.id, organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const attached = site ? await reader.select({id: programs.id}).from(programs)
    .where(and(eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId))) : [];
  assertWholeSiteReportingScope(actor, site, attached.map(row => row.id));
  if (!site) throw new Error("Site scope validation failed");
  return site;
}
