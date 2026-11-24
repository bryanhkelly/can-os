import { buildCurrentReportingMetricRegistry, requireMetricContract, type SourceMetricContract } from "./reporting-metric-registry";
import { CAMPAIGN_METRIC_VERSION, type CampaignMetricKey } from "./campaign-metrics";
import { NONCREDIT_PILOT_DEFINITION_VERSION } from "./reporting-metric-registry";
/** Static allowlisted definitions. No executable SQL, user-provided metric identifiers, or cross-scope queries. */
export const campaignReportKeys=["total","pending","accepted","delivered","bounced","complained","failed","unconfirmed","suppressed","cancelled"] as const satisfies readonly CampaignMetricKey[];
export const pilotOutcomeKeys=["registrations","engagedParticipants","knowledgeCheckPasses","confirmedNoncreditCompletions"] as const;
export function campaignReportDefinitions():readonly SourceMetricContract[]{
  const registry=buildCurrentReportingMetricRegistry();
  return campaignReportKeys.map(k=>requireMetricContract(registry,"campaign."+k,CAMPAIGN_METRIC_VERSION));
}
export function pilotOutcomeDefinitions():readonly SourceMetricContract[]{
  const registry=buildCurrentReportingMetricRegistry();
  return pilotOutcomeKeys.map(k=>requireMetricContract(registry,"noncredit."+k,NONCREDIT_PILOT_DEFINITION_VERSION));
}
