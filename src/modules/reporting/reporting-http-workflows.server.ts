import {buildCurrentReportingMetricRegistry,REPORTING_METRIC_REGISTRY_CONTRACT_VERSION} from "@/domain/reporting-metric-registry";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {readReportingProjectionHealth} from "@/modules/insights/reporting-projection-health.server";
import {readSiteReportingSourceCoverage} from "@/modules/insights/site-reporting-source-query.server";
import {readSiteCampaignDeliveryMetrics} from "@/modules/insights/campaign-delivery-metrics.server";
import {readReportingSourceSnapshot} from "@/modules/insights/reporting-source-snapshot-read.server";
import {parseCommandInput} from "@/domain/command-input";
import {z} from "zod";
import {db} from "@/db/client";
import {AuthorizationError} from "@/domain/command-context";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {readNetworkReportingReadiness} from "@/modules/insights/network-reporting-readiness.server";
import {listScopedGeographyOptions} from "@/modules/geography/reporting-geography.server";
import {resolveOperatorReportingScopeRequest} from "./operator-reporting-scope-request.server";
import {listProviderReportSites} from "./provider-report-sites.server";
import {searchRelationshipRecipients,listRelationshipScopes,listReportingRelationships} from "./bottom-up-reporting-relationships.server";
import type {WorkflowMode} from "@/modules/identity/http-governed-workflows.server";

/** Domain-owned bridge adapters. Existing services retain authority. The
 * internal cross-owner registration projection is intentionally NOT exposed. */
export function reportingHttpWorkflows(request:Request,mode:WorkflowMode){
 const period=z.object({siteId:z.string().uuid(),from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true})}).strict();
 const read=(expected:WorkflowMode)=>{if(request.method!=="GET"||mode!==expected)throw new AuthorizationError("reporting read context");};
 return {
  getReportingMetricDefinitions:async(_raw:unknown)=>{read("can");await getCommandContext(request);return {contractVersion:REPORTING_METRIC_REGISTRY_CONTRACT_VERSION,definitions:buildCurrentReportingMetricRegistry()};},
  getReportingProjectionHealth:async(_raw:unknown)=>{read("can");await requireReportingPlatformAdministrator(request);const health=await readReportingProjectionHealth();return {...health,oldestMissingAt:health.oldestMissingAt?new Date(health.oldestMissingAt).toISOString():null};},
  getSiteReportingSourceCoverage:async(raw:unknown)=>{read("can");return readSiteReportingSourceCoverage(await getCommandContext(request),parseCommandInput(period,raw));},
  getSiteCampaignDeliveryMetrics:async(raw:unknown)=>{read("can");return readSiteCampaignDeliveryMetrics(await getCommandContext(request),parseCommandInput(period,raw));},
  getReportingSourceSnapshot:async(raw:unknown)=>{read("can");return readReportingSourceSnapshot(request,raw);},
  getNetworkReportingReadiness:async(_raw:unknown)=>{read("can");return readNetworkReportingReadiness(await getCommandContext(request));},
  getReportingGeographyOptions:async(raw:unknown)=>{read("operator-reporting");const {basis}=z.object({basis:z.enum(["current","historical"])}).strict().parse(raw);return listScopedGeographyOptions(db,await resolveOperatorReportingScopeRequest(request),basis,new Date());},
  getProviderReportSites:async(_raw:unknown)=>{read("operator-reporting");return listProviderReportSites(db,await resolveOperatorReportingScopeRequest(request));},
  findRelationshipRecipients:async(raw:unknown)=>{read("can");return searchRelationshipRecipients(request,raw);},
  getRelationshipScopes:async(raw:unknown)=>{read("can");return listRelationshipScopes(request,raw);},
  getRelationshipRequests:async(raw:unknown)=>{read("can");return listReportingRelationships(request,raw);},
 };
}
