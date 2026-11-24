import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {db} from "@/db/client";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import {listProviderReportSites} from "./provider-report-sites.server";
/** Discover only Site identities already authorized by the canonical provider
 * capability. No new membership, cross-tenant discovery or participant data. */
export const getProviderReportSites=createServerFn({method:"GET"}).handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
  return listProviderReportSites(db,provider);
});
