/**
 * Authoritative Site input shape is defined by Agent S on sites.address:
 * street1, street2?, city, state, postalCode, country, county?.
 * This only confirms that stored physical facts are sufficient and consistent
 * with the explicitly assigned jurisdiction. It does NOT verify a legal right
 * to operate, governmental approval, or a physical site inspection.
 */
export type PhysicalJurisdictionAssessment = {
  status: "matched_location_facts" | "review_required";
  reason: string | null;
  state: string | null;
  county: string | null;
};

const usStateCodes = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL",
  "IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
  "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim() : null;
}

/** Exact US state-code matching; no timezone, zip-prefix, or geo inference. */
export function evaluateSiteJurisdictionIdentity(
  address: Record<string, unknown> | null,
  jurisdiction: { code: string; countryCode: string | null },
): PhysicalJurisdictionAssessment {
  const reject = (reason: string): PhysicalJurisdictionAssessment => ({
    status: "review_required",reason,state:null,county:null,
  });
  if (!address) return reject("School physical Site address has not been saved");
  const country = nonempty(address.country)?.toUpperCase();
  if (!country || country !== "US")
    return reject("School Site country must be explicitly confirmed as US for this jurisdiction");
  if ((jurisdiction.countryCode ?? "").toUpperCase() !== "US")
    return reject("The selected Program jurisdiction is not a confirmed US jurisdiction");
  for (const key of ["street1","city","postalCode"] as const) {
    if (!nonempty(address[key]))
      return reject("School physical Site address is incomplete: "+key);
  }
  if (!/^\d{5}(?:-\d{4})?$/.test(nonempty(address.postalCode)!))
    return reject("School Site US postal code requires confirmation");
  const state = nonempty(address.state)?.toUpperCase() ?? null;
  if (!state || !usStateCodes.has(state))
    return reject("School physical Site state is missing or not a recognized two-letter US state code");
  const jurisdictionState = jurisdiction.code.trim().toUpperCase().replace(/^US[-_]/, "");
  if (!usStateCodes.has(jurisdictionState))
    return reject("Program jurisdiction is not mapped to a recognized US state");
  if (state !== jurisdictionState)
    return reject("School physical state disagrees with Program jurisdiction");
  return {
    status: "matched_location_facts",reason:null,state,
    county:nonempty(address.county),
  };
}
