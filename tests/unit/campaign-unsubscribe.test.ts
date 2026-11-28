import {describe,expect,it} from "vitest";
import {validateCampaignUnsubscribe,campaignUnsubscribeToken} from "@/domain/campaign-unsubscribe";
import {handleCampaignUnsubscribe} from "@/modules/communication/campaign-unsubscribe-http";
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
 it("fails closed for absent tokens, malformed tokens and missing content type",async()=>{
  expect(campaignUnsubscribeToken(new Request(url))).toBe("11111111-1111-4111-8111-111111111111");
  expect(campaignUnsubscribeToken(new Request("https://example.org/api/campaigns/unsubscribe"))).toBeNull();
  expect(campaignUnsubscribeToken(new Request(url.replace(/token=.*/,"token=invalid")))).toBeNull();
  expect(await validateCampaignUnsubscribe(new Request(url,{method:"POST"}))).toBe(400);
 });
 it("interprets bounded provider Retry-After",()=>{
  expect(campaignRetryAfterMs("30",0)).toBe(30000);
  expect(campaignRetryAfterMs("bad",0)).toBe(0);
  expect(campaignRetryAfterMs("999999",0)).toBe(72000000);
 });
});

describe("campaign unsubscribe HTTP handler",()=>{
 it("never writes on GET, rejects invalid requests, and suppresses only the exact confirmed token",async()=>{
  const tokens:string[]=[];
  const suppress=async(token:string)=>{tokens.push(token);};
  const preview=await handleCampaignUnsubscribe(new Request(url),suppress);
  expect(preview.status).toBe(200);
  expect(preview.headers.get("cache-control")).toBe("no-store");
  expect(preview.headers.get("referrer-policy")).toBe("no-referrer");
  expect(tokens).toEqual([]);
  const invalid=await handleCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"no"})}),suppress);
  expect(invalid.status).toBe(400);
  const duplicate=await handleCampaignUnsubscribe(new Request(url+"&token=other",{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"One-Click"})}),suppress);
  expect(duplicate.status).toBe(400);
  const oversized=await handleCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"x".repeat(5000)})}),suppress);
  expect(oversized.status).toBe(413);
  const unsupported=await handleCampaignUnsubscribe(new Request(url,{method:"DELETE"}),suppress);
  expect(unsupported.status).toBe(405);
  expect(tokens).toEqual([]);
  const accepted=await handleCampaignUnsubscribe(new Request(url,{method:"POST",body:new URLSearchParams({"List-Unsubscribe":"One-Click"})}),suppress);
  expect(accepted.status).toBe(200);
  expect(tokens).toEqual(["11111111-1111-4111-8111-111111111111"]);
 });
});
