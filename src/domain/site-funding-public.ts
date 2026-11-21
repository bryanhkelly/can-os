import { siteHostingV61Schema, type SiteTaxStatusV61 } from "./site-information-v61";

/** Display-safe derivative of Hosting & Organization. EIN and private evidence
 * never enter a browser-facing projection. Site-entered claims are not verified. */
export type SiteFundingPublicContext={
  reportedStatus:SiteTaxStatusV61;
  organizationName:string|null;
  subject:"responsible"|"host"|"sponsor";
  verification:"self_reported";
};
export function projectSiteFundingPublicContext(raw:unknown):SiteFundingPublicContext|null {
  const host=siteHostingV61Schema.safeParse(raw);
  if(!host.success)return null;
  const status=host.data.nonprofitStatus;
  if(!status||status==="not_provided"||status==="unsure")return null;
  return {
    reportedStatus:status,
    organizationName:host.data.nonprofitOrganizationName?.trim()||null,
    subject:host.data.nonprofitSubject??"responsible",
    verification:"self_reported",
  };
}

/** A public page must not turn self-reporting into an IRS determination.
 * Organizational verification may later project a separate approved claim. */
export function fundingStatusPublicNote(context:SiteFundingPublicContext|null|undefined):string {
  if(!context)return "";
  if(context.reportedStatus==="not_tax_exempt")
    return "The organization has not reported tax-exempt status.";
  if(context.reportedStatus==="pending")
    return "Tax-exempt recognition was reported as pending. No approval is represented.";
  return "Tax-exempt information was supplied during setup and awaits independent verification. This website does not yet represent the organization as a verified 501(c)(3).";
}
