import { buildCurrentReportingMetricRegistry, requireMetricContract, NONCREDIT_PILOT_DEFINITION_VERSION, type SourceMetricContract } from "./reporting-metric-registry";
import { CAMPAIGN_METRIC_VERSION, CAMPAIGN_METRIC_DEFINITIONS, type CampaignMetricKey } from "./campaign-metrics";
import { GO_LINK_EVIDENCE_VERSION } from "./go-link-evidence-metrics";

/** Static allowlisted definitions. No executable SQL, user-supplied identifiers or cross-scope queries. */
export const campaignReportKeys: readonly CampaignMetricKey[] = CAMPAIGN_METRIC_DEFINITIONS.map(definition => definition.key);
export const pilotOutcomeKeys=["registrations","engagedParticipants","knowledgeCheckPasses","confirmedNoncreditCompletions"] as const;
export const goReportKeys=["observedRedirects30d","linkOpens30d","pageViews30d","redirectResponses30d","unclassifiedEntries30d","referralNoncreditRegistrations30d"] as const;
function resolveDefinitions(namespace:string,keys:readonly string[],version:string):readonly SourceMetricContract[]{
  const registry=buildCurrentReportingMetricRegistry();
  return keys.map(key=>requireMetricContract(registry,namespace+"."+key,version));
}
export function campaignReportDefinitions(){return resolveDefinitions("campaign",campaignReportKeys,CAMPAIGN_METRIC_VERSION);}
export function pilotOutcomeDefinitions(){return resolveDefinitions("noncredit",pilotOutcomeKeys,NONCREDIT_PILOT_DEFINITION_VERSION);}
export function goReportDefinitions(){return resolveDefinitions("go",goReportKeys,GO_LINK_EVIDENCE_VERSION);}

/** A definition resolves its value by authoritative source key, never array position.
 * Unavailable or invalid counts remain null. Zero is a measured value.
 */
export function bindRegisteredCounts(definitions:readonly SourceMetricContract[],values:Readonly<Record<string,number|null|undefined>>){
  return definitions.map(def=>{
    const value=Object.hasOwn(values,def.sourceMetricKey)?values[def.sourceMetricKey]:null;
    return {id:def.metricKey,label:def.label,value:typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null};
  });
}
