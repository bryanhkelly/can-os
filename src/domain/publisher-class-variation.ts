import { z } from "zod";
import { AuthorizationError } from "./command-context";
import { classDeliveryModeSchema } from "./unified-class";

/**
 * Publisher-owned, versioned constraints stored on the existing immutable
 * offering_versions.product_definition.localClassPolicy JSON field.
 * This is not a local permission grant or an approval workflow.
 * Unknown publisher policy versions fail closed rather than being ignored.
 */
const modes=classDeliveryModeSchema.options;
export const publisherClassVariationPolicySchema=z.object({
  version:z.literal(1),
  classTitle:z.enum(["local","locked"]).default("local"),
  allowedDeliveryModes:z.array(classDeliveryModeSchema).min(1)
    .refine(values=>new Set(values).size===values.length,"Duplicate delivery mode")
    .default([...modes]),
  maxClassCapacity:z.number().int().positive().nullable().default(null),
}).strict();
export type PublisherClassVariationPolicy=z.infer<typeof publisherClassVariationPolicySchema>;

const defaultPolicy:PublisherClassVariationPolicy={
  version:1,classTitle:"local",allowedDeliveryModes:[...modes],maxClassCapacity:null,
};

export function publisherClassVariationPolicy(productDefinition:unknown):PublisherClassVariationPolicy{
  if(!productDefinition||typeof productDefinition!=="object"||Array.isArray(productDefinition))
    return {...defaultPolicy,allowedDeliveryModes:[...modes]};
  const record=productDefinition as Record<string,unknown>;
  if(record.localClassPolicy===undefined)
    return {...defaultPolicy,allowedDeliveryModes:[...modes]};
  const parsed=publisherClassVariationPolicySchema.safeParse(record.localClassPolicy);
  if(!parsed.success)
    throw new AuthorizationError("unsupported publisher Class variation policy; request publisher review");
  return parsed.data;
}

export function assertPublisherClassVariationAllowed(
  policy:PublisherClassVariationPolicy,
  courseTitle:string,
  input:{title:string;deliveryMode:z.infer<typeof classDeliveryModeSchema>;capacity?:number|null},
):void{
  if(policy.classTitle==="locked"&&input.title.trim()!==courseTitle.trim())
    throw new AuthorizationError("publisher-locked Course/Class title; new publisher approval required");
  if(!policy.allowedDeliveryModes.includes(input.deliveryMode))
    throw new AuthorizationError("publisher did not authorize this Class delivery mode");
  // Null is unlimited and therefore exceeds any publisher-imposed ceiling.
  if(policy.maxClassCapacity!==null&&
      (input.capacity===null||input.capacity===undefined||input.capacity>policy.maxClassCapacity))
    throw new AuthorizationError("Class capacity exceeds the publisher-approved maximum");
}

// These are the stable boundaries even when no optional localClassPolicy exists.
export const publisherOwnedFields=[
  "offeringVersionId","courseVersionId","curriculum","assessments",
  "requiredCourseComposition","academicCreditRequirements",
] as const;
export const localClassFields=[
  "title","capacity","deliveryMode","siteId","sessionScheduling",
  "facilitatorAssignments","classOfferingTerms",
] as const;
