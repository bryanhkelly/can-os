import { describe, expect, it } from "vitest";
import {
  assertPublisherClassVariationAllowed,
  publisherClassVariationPolicy, publisherClassVariationPolicySchema,
  localClassFields,publisherOwnedFields,
} from "@/domain/publisher-class-variation";

describe("WS5 publisher-approved local variation",()=>{
  it("preserves existing local Class defaults for publisher products without explicit policy",()=>{
    const policy=publisherClassVariationPolicy({kind:"program"});
    expect(policy.classTitle).toBe("local");
    expect(policy.allowedDeliveryModes).toContain("facilitated");
    expect(policy.maxClassCapacity).toBeNull();
    expect(()=>assertPublisherClassVariationAllowed(policy,"Course",{
      title:"Local Class",deliveryMode:"facilitated",capacity:null,
    })).not.toThrow();
  });
  it("enforces publisher-locked title and delivery modes regardless of client selection",()=>{
    const policy=publisherClassVariationPolicy({
      localClassPolicy:{
        version:1,classTitle:"locked",allowedDeliveryModes:["self_paced"],maxClassCapacity:25,
      },
    });
    const valid={title:"Course A",deliveryMode:"self_paced" as const,capacity:20};
    expect(()=>assertPublisherClassVariationAllowed(policy,"Course A",valid)).not.toThrow();
    expect(()=>assertPublisherClassVariationAllowed(policy,"Course A",{
      ...valid,title:"New curriculum version",
    })).toThrow(/publisher-locked/);
    expect(()=>assertPublisherClassVariationAllowed(policy,"Course A",{
      ...valid,deliveryMode:"facilitated",
    })).toThrow(/publisher did not authorize/);
  });
  it("treats unlimited seats as exceeding a publisher capacity ceiling",()=>{
    const policy=publisherClassVariationPolicy({localClassPolicy:{version:1,maxClassCapacity:25}});
    for(const capacity of [null,undefined,26]){
      expect(()=>assertPublisherClassVariationAllowed(policy,"AI",{
        title:"AI local",deliveryMode:"self_paced",capacity,
      })).toThrow(/capacity/);
    }
    expect(()=>assertPublisherClassVariationAllowed(policy,"AI",{
      title:"AI local",deliveryMode:"self_paced",capacity:25,
    })).not.toThrow();
  });
  it("fails closed for unsupported schema or forged publisher policy claims",()=>{
    for(const invalid of [
      {version:2},{version:1,allowedDeliveryModes:["self_paced","self_paced"]},
      {version:1,capacityCeiling:100},{version:1,allowedDeliveryModes:[]},
    ]){
      expect(publisherClassVariationPolicySchema.safeParse(invalid).success).toBe(false);
      expect(()=>publisherClassVariationPolicy({localClassPolicy:invalid})).toThrow();
    }
    expect(publisherOwnedFields).toContain("assessments");
    expect(publisherOwnedFields).toContain("offeringVersionId");
    expect(localClassFields).toContain("sessionScheduling");
    expect(localClassFields).not.toContain("assessments");
  });
});
