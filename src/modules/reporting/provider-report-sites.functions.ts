import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,asc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {sites} from "@/db/schema";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import type {ReportSiteOption} from "@/domain/report-filter-state";
/** Discover only Site identities already authorized by the canonical provider
 * capability. No new membership, cross-tenant discovery or participant data. */
export const getProviderReportSites=createServerFn({method:"GET"}).handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
  if(provider.siteIds.length>1000)throw Error("Authorized Site options exceed the bounded report scope");
  const rows=await db.select({id:sites.id,label:sites.name}).from(sites)
    .where(and(eq(sites.organizationId,provider.organizationId),inArray(sites.id,provider.siteIds)))
    .orderBy(asc(sites.name),asc(sites.id)).limit(1001);
  if(rows.length>1000)throw Error("Authorized Site options exceed the bounded report scope");
  return rows satisfies ReportSiteOption[];
});
