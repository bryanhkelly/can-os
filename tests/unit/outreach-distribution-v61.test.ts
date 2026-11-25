import {describe,it,expect} from "vitest";
import {parseCampaignRecipientCsv} from "@/domain/campaign-policy";
import {outreachProgressStepsV61} from "@/components/launch-studio/MarketingPackageWizardV61";
describe("Outreach distribution",()=>{
 it("preserves the six editorial steps and adds distribution",()=>{
   expect(outreachProgressStepsV61.map(s=>s.title)).toEqual(["People","Message","Highlights","Action","Materials","Review","Distribute"]);
 });
 it("imports and deduplicates a single consent-review email column",()=>{
   expect(parseCampaignRecipientCsv('\uFEFFemail\r\n"A@realmail.com"\r\na@realmail.com\r\nb@realmail.com')).toBe("a@realmail.com\nb@realmail.com");
 });
 it("rejects multi-column, invalid, empty and synthetic input",()=>{
   for(const raw of ["name,email\nAlice,a@realmail.com","email\nnot-an-email","email","a@example.com","a@realmail.com b@realmail.com",'""\na@realmail.com','email\n""','"a@realmail.com,b@realmail.com"',"a@school.demo","a@foo.invalid"])expect(()=>parseCampaignRecipientCsv(raw)).toThrow();
 });
 it("accepts exactly 1,000 distinct addresses",()=>{
   expect(parseCampaignRecipientCsv(Array.from({length:1000},(_,i)=>"a"+i+"@realmail.com").join("\n")).split("\n")).toHaveLength(1000);
 });
 it("accepts a case-insensitive header and blank physical lines",()=>{
   expect(parseCampaignRecipientCsv("\nEMAIL ADDRESS\n\nA@realmail.com\n")).toBe("a@realmail.com");
 });
 it("enforces the list limit",()=>{
   expect(()=>parseCampaignRecipientCsv(Array.from({length:1001},(_,i)=>"a"+i+"@realmail.com").join("\n"))).toThrow();
 });
});
