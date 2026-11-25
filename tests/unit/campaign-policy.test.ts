import {describe,it,expect} from "vitest";
import {campaignOwnerScope,parseCampaignRecipients,campaignRetryable} from "@/domain/campaign-policy";
describe("campaign policy",()=>{
 it("normalizes and deduplicates only valid addresses",()=>{expect(parseCampaignRecipients("A@real.org a@real.org").recipients).toEqual(["a@real.org"]);expect(parseCampaignRecipients("fake@school.demo x@example.com").invalid).toHaveLength(2);});
 it("does not share contact lists across owner boundaries",()=>{const org=campaignOwnerScope({ownerKind:"organization",organizationId:"org",siteId:null,programId:null});const site=campaignOwnerScope({ownerKind:"site",organizationId:"org",siteId:"site",programId:null});expect(org.ownerScope).not.toBe(site.ownerScope);expect(org.senderScope).toBe(site.senderScope);});
 it("bounds retries inside the provider idempotency window",()=>{expect(campaignRetryable(3,new Date(0),1000)).toBe(true);expect(campaignRetryable(4,new Date(0),1000)).toBe(false);expect(campaignRetryable(1,new Date(0),21*3600000)).toBe(false);});
});
