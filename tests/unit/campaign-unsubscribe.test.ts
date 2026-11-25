import {describe,expect,it} from "vitest";
import {validateCampaignUnsubscribe,campaignUnsubscribeToken} from "@/domain/campaign-unsubscribe";
import {campaignRetryAfterMs} from "@/domain/campaign-policy";
const url="https://example.org/api/campaigns/unsubscribe?token=11111111-1111-4111-8111-111111111111";
describe("campaign unsubscribe protocol",()=>{
 it("accepts both RFC 8058 encodings",async()=>{
  const form=new FormData();form.set("List-Unsubscribe","One-Click");
  expect(await validateCampaignUnsubscribe(new Request(url,{method:"POST",body:form}))).toBe(200);
  expect(await validateCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"One-Click"})}))).toBe(200);
 });
 it("rejects GET, duplicate fields, duplicate tokens and oversized streamed bodies",async()=>{
  expect(await validateCampaignUnsubscribe(new Request(url))).toBe(400);
  expect(await validateCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams("List-Unsubscribe=One-Click&List-Unsubscribe=One-Click")}))).toBe(400);
  expect(campaignUnsubscribeToken(new Request(url+"&token=other"))).toBeNull();
  expect(await validateCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"x".repeat(5000)})}))).toBe(413);
 });
 it("interprets bounded provider Retry-After",()=>{
  expect(campaignRetryAfterMs("30",0)).toBe(30000);
  expect(campaignRetryAfterMs("bad",0)).toBe(0);
  expect(campaignRetryAfterMs("999999",0)).toBe(72000000);
 });
});
