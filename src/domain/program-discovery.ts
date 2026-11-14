import { z } from "zod";

export const programDiscoveryInputSchema = z.object({
  subject: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("site"),
      siteId: z.string().uuid(),
    }).strict(),
    z.object({
      kind: z.literal("proposed_location"),
      geographicAreaId: z.string().uuid(),
    }).strict(),
  ]),
  deliveryContext: z.enum(["remote", "onsite", "hybrid"]),
}).strict();

export type CatalogAvailabilityStatus =
  | "supported"
  | "conditional"
  | "unavailable"
  | "review_required";
export type CatalogAvailability = "possible" | "conditional" | "unavailable" | "requires_research";

export interface ProgramAvailability {
  policyVersionId: string;
  offeringVersionId: string;
  providerSupport: CatalogAvailability;
  regulatoryStatus: CatalogAvailability;
  catalogStatus: CatalogAvailabilityStatus;
  explanation: string;
}

export interface PublishedOffering {
  offeringId: string;
  offeringVersionId: string;
  code: string;
  title: string;
  versionNo: number;
}

export interface AvailableOffering {
  offering: PublishedOffering;
  availability: ProgramAvailability[];
  activationEligible: false;
}

/** Site planning may select only supported or conditional published Offerings.
 * Selecting one is still an unapproved adoption intent, never a Deployment. */
export function canPlanOffering(item: AvailableOffering): boolean {
  return item.availability.some(policy =>
    policy.catalogStatus === "supported" || policy.catalogStatus === "conditional"
  );
}

export function projectAvailableOfferings(
  products: readonly PublishedOffering[],
  availability: readonly ProgramAvailability[],
): AvailableOffering[] {
  const productsByVersion = new Map(
    products.map((product) => [product.offeringVersionId, product]),
  );

  const offerings = new Map<string, AvailableOffering>();
  for (const policy of availability) {
    const product = productsByVersion.get(policy.offeringVersionId);
    if (!product) continue;
    const item = offerings.get(product.offeringVersionId) ?? {
      offering: product,
      availability: [],
      activationEligible: false,
    };
    item.availability.push(policy);
    offerings.set(product.offeringVersionId, item);
  }

  return [...offerings.values()]
    .map((item) => ({
      ...item,
      availability: [...item.availability].sort((left, right) =>
        left.policyVersionId.localeCompare(right.policyVersionId),
      ),
    }))
    .sort((left, right) =>
      left.offering.title.localeCompare(right.offering.title) ||
      left.offering.code.localeCompare(right.offering.code),
    );
}
