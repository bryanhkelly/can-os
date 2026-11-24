/** Versioned discovery metadata, not an authorization grant or a generic query endpoint.
 * Each destination retains its own independently enforced server authorization.
 */
export const REPORT_CATALOG_VERSION=1 as const;
type ReportCatalogEntry={
  id:string;version:1;title:string;description:string;
  scope:"provider"|"class"|"site"|"link"|"platform"|"network";
  period:"lifetime_current"|"closed_utc"|"rolling_utc"|"current";
  placement:"report_center"|"class_workspace"|"engagement_library"|"go_link_workspace"|"platform_workspace"|"network_workspace"|"not_available";
  classification:"private_operational";
};
export const REPORT_CATALOG=[
  {id:"provider-delivery",version:1,title:"Program and Site delivery",description:"Registration, attendance and completion evidence with release-level detail.",scope:"provider",period:"lifetime_current",placement:"report_center",classification:"private_operational"},
  {id:"noncredit-registration-outcomes",version:1,title:"Program learning outcomes",description:"Unique learners, engagement, verified participation minutes and knowledge checks.",scope:"provider",period:"rolling_utc",placement:"report_center",classification:"private_operational"},
  {id:"native-class-evidence",version:1,title:"Class evidence",description:"Sessions, enrollment, verified attendance, assessments and awards.",scope:"class",period:"current",placement:"class_workspace",classification:"private_operational"},
  {id:"site-campaign-delivery",version:1,title:"Email delivery evidence",description:"Delivery counts, provider acceptance, bounces and suppression.",scope:"site",period:"closed_utc",placement:"engagement_library",classification:"private_operational"},
  {id:"go-link-evidence",version:1,title:"Go Link distribution",description:"Observed requests and separately attributed registration claims.",scope:"link",period:"rolling_utc",placement:"go_link_workspace",classification:"private_operational"},
  {id:"projection-health",version:1,title:"Reporting infrastructure health",description:"Source projection receipt status and reconciliation.",scope:"platform",period:"current",placement:"platform_workspace",classification:"private_operational"},
  {id:"network-reporting-readiness",version:1,title:"Network reporting readiness",description:"Current HQ reporting setup and explicit execution blockers.",scope:"network",period:"current",placement:"network_workspace",classification:"private_operational"},
  {id:"network-impact",version:1,title:"Network impact",description:"Requires independently authorized network reporting grants and disclosure governance.",scope:"network",period:"closed_utc",placement:"not_available",classification:"private_operational"},
] as const satisfies readonly ReportCatalogEntry[];
export type ReportCatalogId=typeof REPORT_CATALOG[number]["id"];
export function reportCatalogEntry(id:string){return REPORT_CATALOG.find(entry=>entry.id===id)??null;}
export function reportDefinitionId(id:ReportCatalogId){const entry=reportCatalogEntry(id);if(!entry)throw Error("Unknown report");return entry.id+"-v"+entry.version;}
export const reportCenterEntries=REPORT_CATALOG.filter(entry=>entry.placement==="report_center");
