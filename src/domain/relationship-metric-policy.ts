import {buildCurrentReportingMetricRegistry,type SourceMetricContract} from "@/domain/reporting-metric-registry";
import type {RelationshipMetric,RelationshipProposal} from "@/domain/bottom-up-reporting-relationships";

/** Permission to propose sharing terms, NOT permission to release a report.
 * Cross-tenant publication requires its own independently reviewed disclosure.
 * Exact source versions are pinned so a registry change cannot widen consent. */
const initialTerms = [
  {metricKey:"class.registrations",definitionVersion:"0.1.0"},
  {metricKey:"class.uniquePeople",definitionVersion:"0.1.0"},
  {metricKey:"noncredit.registrations",definitionVersion:"1.0.0"},
  {metricKey:"noncredit.distinctLearners",definitionVersion:"1.0.0"},
  {metricKey:"noncredit.verifiedParticipationMinutes",definitionVersion:"1.0.0"},
  {metricKey:"noncredit.confirmedNoncreditCompletions",definitionVersion:"1.0.0"},
] satisfies readonly RelationshipMetric[];

export function relationshipProposalMetrics(scope:RelationshipProposal["scopeKind"],
  registry:readonly SourceMetricContract[]=buildCurrentReportingMetricRegistry()){
  return registry.filter(metric=>initialTerms.some(term=>term.metricKey===metric.metricKey&&
    term.definitionVersion===metric.definitionVersion)&&
    (scope!=="class"||metric.sourceDomain==="native_class"))
    .map(({metricKey,definitionVersion,label,sourceDomain})=>({
      metricKey,definitionVersion,label:(sourceDomain==="native_class"?"Class: ":"Noncredit: ")+label,
    }));
}
