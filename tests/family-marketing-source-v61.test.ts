import { describe,expect,it } from "vitest";
import {
  familyInvitationSendInput,
  familyInvitationBatchMetadataSchema,
} from "../src/domain/family-invitations";

const source={packageId:"11111111-1111-4111-8111-111111111111",packageRevision:3};
const recipient={key:"22222222-2222-4222-8222-222222222222",
  firstName:"Taylor",lastName:"Example",email:"adult@example.org",
  status:"queued" as const,attempts:0};

describe("frozen invitation copy and Marketing Package source provenance",()=>{
  it("accepts an optional source on the interest send command without copying recipients to a Package",()=>{
    const send=familyInvitationSendInput.parse({
      requestId:"33333333-3333-4333-8333-333333333333",
      programId:"44444444-4444-4444-8444-444444444444",
      rawContacts:"Taylor,Example,adult@example.org",
      subject:"A new learning idea",
      introduction:"We are exploring new learning opportunities.",
      purpose:"interest",confirmed:true,marketingSource:source,
    });
    expect(send.marketingSource).toEqual(source);
  });
  it("retains source revision and exact sent introduction in the historical batch metadata",()=>{
    const snapshot=familyInvitationBatchMetadataSchema.parse({
      kind:"family_invitation_batch",version:1,
      batchRequestId:"33333333-3333-4333-8333-333333333333",
      siteSlug:"example-site",
      siteId:"55555555-5555-4555-8555-555555555555",
      destination:"preopening_interest",
      introduction:"Operator's revised, frozen introduction",
      marketingSource:source,status:"queued",recipients:[recipient],
    });
    expect(snapshot.marketingSource?.packageRevision).toBe(3);
    expect(snapshot.introduction).toBe("Operator's revised, frozen introduction");
  });
  it("continues to read older batches without marketing attribution",()=>{
    const legacy=familyInvitationBatchMetadataSchema.parse({
      kind:"family_invitation_batch",version:1,
      batchRequestId:"33333333-3333-4333-8333-333333333333",
      siteSlug:"example-site",introduction:"Original message",
      status:"queued",recipients:[recipient],
    });
    expect(legacy.marketingSource).toBeUndefined();
  });
});
