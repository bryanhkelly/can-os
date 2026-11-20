import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { geographicAreas } from "@/db/canonical-v301";
import type { PhysicalSiteAddress } from "@/domain/site-setup-configuration";
import { DomainError } from "@/domain/errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Administrative state/territory mapping from a complete, normalized address.
 * It does NOT verify the premises or grant jurisdiction, school, enrollment,
 * accreditation, publication, or program authority.
 *
 * The current reference catalog has US state/territory records only. Do not
 * infer country from a ZIP, timezone, planned location, or legacy Site name,
 * and do not assign a US area to an unsupported international address.
 */
export function siteGeographicAreaCode(
  address: PhysicalSiteAddress | null | undefined,
): string | null {
  return address?.country === "US" ? `US-${address.state}` : null;
}

/** Look up the existing canonical public.geographic_areas row.
 * Run in the SAME Site create/address-update transaction. The absence of a
 * configured US reference is an error, not permission to launch anyway.
 */
export async function resolveSiteGeographicAreaId(
  tx: Tx,
  address: PhysicalSiteAddress | null | undefined,
): Promise<string | null> {
  const code = siteGeographicAreaCode(address);
  if (!code) return null;
  const [geography] = await tx.select({ id: geographicAreas.id })
    .from(geographicAreas)
    .where(eq(geographicAreas.code, code))
    .limit(2);
  if (!geography) throw new DomainError(
    "VALIDATION_FAILED",
    "The Site's state or territory has no configured geographic reference.",
  );
  return geography.id;
}
