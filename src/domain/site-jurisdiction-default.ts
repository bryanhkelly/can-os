/** Resolve a school location's state only from an explicit address, never timezone. */
export function addressStateJurisdiction(
  address: Record<string,unknown> | null | undefined,
  jurisdictions: Array<{id:string;code:string;name:string}>,
): string | null {
  if (!address) return null;
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
