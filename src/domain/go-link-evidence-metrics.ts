/** Go Link evidence is a read-only adapter over two authoritative sources.
 * Counting a redirect does not prove a person or a conversion.
 * Referral-coded registration claims are NOT proof of a click-to-signup funnel.
 */
export const GO_LINK_EVIDENCE_VERSION="1.0.0" as const;
export const GO_LINK_METRIC_DEFINITIONS=[
  {
    key:"observedRedirects30d",
    label:"Observed redirects (30 days)",
    source:"public.site_go_link_daily_visits",
    denominator:"None; a redirect is an individual request, not a unique visitor",
    rule:"Sum daily redirect counters for the exact Go Link in the 30 UTC calendar days including today",
    timeBasis:"UTC day of successful GET redirect",
  },
  {
    key:"referralNoncreditRegistrations30d",
    label:"Training registration claims referencing link (30 days)",
    source:"public.noncredit_self_enrollment_claims",
    denominator:"No click-to-enrollment conversion denominator is asserted",
    rule:"Count canonical noncredit registration claims matching the exact referral code, Site and training release; unavailable for other destination types",
    timeBasis:"UTC claim creation timestamp in the 30-day window",
  },
] as const;
