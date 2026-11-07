import { usStatesAndTerritories } from "./site-setup-configuration";

/** Planning state is allowed for program setup; it is NEVER opening evidence.
 * Once a verified physical address is provided it takes precedence. */
export function siteJurisdictionLocation(
  address: Record<string, unknown> | null | undefined,
  planningLocation: { state: string } | null | undefined,
): Record<string, unknown> | null {
  if (address && typeof address.country === "string" && address.country.trim()) return address;
  if (planningLocation?.state?.trim()) return { country: "US", state: planningLocation.state };
  return address ?? null;
}


export function launchSiteJurisdictionIssue(
  address: Record<string, unknown> | null | undefined,
  jurisdictions: Array<{ id: string; code: string; name: string }>,
  selectedId: string,
): { code: "LAUNCH_LOCATION_UNSUPPORTED" | "LAUNCH_LOCATION_MISMATCH"; message: string } | null {
  if (!address || typeof address.country !== "string" ||
      !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(address.country.trim().toUpperCase())) return null;
  const state = [address.stateCode, address.state, address.regionCode, address.region]
    .find(value => typeof value === "string" && value.trim());
  if (typeof state !== "string") return null;
  const key = state.trim().toUpperCase().replace(/^US[-_]/, "");
  const name = usStatesAndTerritories[key] ??
    Object.values(usStatesAndTerritories).find(value => value.toUpperCase() === key);
  if (!name) return null;
  const matchingId = addressStateJurisdiction(address, jurisdictions);
  if (!matchingId) return {
    code: "LAUNCH_LOCATION_UNSUPPORTED",
    message: `School setup for ${name} isn't available yet. Ask CAN to add support for your school's state. You can save a draft while you wait; don't choose a different state to continue.`,
  };
  if (selectedId && selectedId !== matchingId) return {
    code: "LAUNCH_LOCATION_MISMATCH",
    message: `Your saved school address is in ${name}. Choose ${name} below, or correct the address if your school is elsewhere.`,
  };
  return null;
}

/** Resolve a school location's state only from an explicit address, never timezone. */
export function addressStateJurisdiction(
  address: Record<string,unknown> | null | undefined,
  jurisdictions: Array<{id:string;code:string;name:string}>,
): string | null {
  if (!address) return null;
  // A foreign state/province sharing a US state name or abbreviation is not
  // evidence that the school operates in that US jurisdiction.
  const country=address.country;
  // An absent country on a legacy Site is not evidence of US school jurisdiction.
  if(typeof country!=="string" || !["US","USA","UNITED STATES","UNITED STATES OF AMERICA"].includes(country.trim().toUpperCase())) return null;
  const values=[address.stateCode,address.state,address.regionCode,address.region];
  for(const value of values) {
    if(typeof value!=="string" || !value.trim())continue;
    const key=value.trim().toUpperCase().replace(/^US[-_]/,"");
    const found=jurisdictions.find(j=>
      j.code.toUpperCase().replace(/^US[-_]/,"")===key ||
      j.name.toUpperCase()===key
    );
    if(found)return found.id;
  }
  return null;
}
