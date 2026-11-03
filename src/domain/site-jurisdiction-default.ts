/** Resolve a school location's state only from an explicit address, never timezone. */
export function addressStateJurisdiction(
  address: Record<string,unknown> | null | undefined,
  jurisdictions: Array<{id:string;code:string;name:string}>,
): string | null {
  if (!address) return null;
  // A foreign state/province sharing a US state name or abbreviation is not
  // evidence that the school operates in that US jurisdiction.
  const country=address.country;
  if(typeof country==="string" && !["US","USA","UNITED STATES","UNITED STATES OF AMERICA"].includes(country.trim().toUpperCase())) return null;
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
