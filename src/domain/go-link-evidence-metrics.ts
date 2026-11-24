/** Go Link evidence is a read-only adapter over two authoritative sources.
 * Counting a successful entry request does not prove a person or a conversion.
 * Referral-coded registration claims are NOT proof of a click-to-signup funnel.
 */
export const GO_LINK_EVIDENCE_VERSION="1.0.0" as const;
export const GO_LINK_METRIC_DEFINITIONS=[
  {
    key:"observedRedirects30d",
    label:"Observed Go requests (30 days)",
    source:"public.site_go_link_daily_visits",
    denominator:"None; a redirect or rendered page is an individual request, not a unique visitor",
    rule:"Sum daily successful entry-request counters (stored in the legacy redirects column) for the exact Go Link in the 30 UTC calendar days including today",
    timeBasis:"UTC day of successful public GET resolution",
  },
  ...[
    {key:"linkOpens30d",label:"Classified Go link opens (30 days)",column:"link_opens",rule:"Count classified successful entry requests; preview navigation using a page selector is excluded, including home navigation"},
    {key:"pageViews30d",label:"Go-rendered page views (30 days)",column:"page_views",rule:"Count successful rendered Go pages, including preview subpages"},
    {key:"redirectResponses30d",label:"Go redirect responses (30 days)",column:"redirect_responses",rule:"Count successful redirect responses, not confirmed arrival at the destination"},
    {key:"unclassifiedEntries30d",label:"Unclassified Go entries (30 days)",column:"redirects minus link_opens",rule:"Count legacy entry requests not classified by response type; do not infer historical page views or redirects"},
  ].map(metric=>({
    key:metric.key,label:metric.label,source:"public.site_go_link_daily_visits",
    denominator:"None; an anonymous request is not a unique visitor",
    rule:metric.rule+" using "+metric.column+" for the exact Go Link in the 30 UTC calendar days including today",
    timeBasis:"UTC day of successful public GET resolution",
  })),
  {
    key:"referralNoncreditRegistrations30d",
    label:"Training registration claims referencing link (30 days)",
    source:"public.noncredit_self_enrollment_claims",
    denominator:"No click-to-enrollment conversion denominator is asserted",
    rule:"Count canonical noncredit registration claims matching the exact referral code, Site and training release; unavailable for other destination types",
    timeBasis:"UTC claim creation timestamp in the 30-day window",
  },
] as const;
