import { createHash } from "node:crypto";

/**
 * Stable, public-safe school location revision for schedule approvals.
 * Agent S's physical address revision and the current canonical address are
 * both bound, without exposing the street address in public schedule DTOs.
 * A draft contact update does not alter this fingerprint. A direct address
 * mutation that omits S's revision still changes the fingerprint.
 */
export function publicSchoolDaySiteRevision(input:{
  address:Record<string,unknown>|null;
  metadata:Record<string,unknown>;
}):string {
  const address=input.address??{};
  const location=Object.fromEntries(
    ["street1","street2","city","state","postalCode","country","county"]
      .map(key=>[key,typeof address[key]==="string"
        ? (address[key] as string).trim():""]),
  );
  const revision=typeof input.metadata.sitePhysicalAddressRevision==="string"
    ? input.metadata.sitePhysicalAddressRevision : "legacy_unverified";
  return "physical-site-v1:"+createHash("sha256")
    .update(JSON.stringify({location,revision})).digest("hex");
}
