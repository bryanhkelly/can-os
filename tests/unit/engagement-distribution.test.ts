import {describe,expect,it} from "vitest";
import {buildEngagementInvitation,buildInvitationMailto,parseInvitationRecipients} from "@/domain/engagement-distribution";
import {engagementDefinitionSchema} from "@/domain/engagement-definition";
const def=engagementDefinitionSchema.parse({domain:"learning",subject:{kind:"initiative",id:null,label:"Pilot training"},audience:["adults"],interaction:"discover",expectedOutcome:"viewed",presentation:{headline:"Pilot invitation",summary:"Explore our proposed pilot training."},execution:{mode:"page",template:"invitation",action:{kind:"information",journeyId:"start-a-school"},actionLabel:"Explore"}});
describe("engagement invitation distribution",()=>{
  it("pins the public Go origin and immutable copy",()=>{
    const draft=buildEngagementInvitation(def,"AbCdEf123456","https://example.org");
    expect(draft.url).toBe("https://example.org/go/AbCdEf123456");
    expect(draft.body).toContain(draft.url);
    expect(()=>buildEngagementInvitation(def,"AbCdEf123456","https://example.org/private")).toThrow();
    expect(()=>buildEngagementInvitation(def,"AbCdEf123456","http://example.org")).toThrow();
  });
  it("deduplicates addresses and preserves BCC privacy",()=>{
    const result=parseInvitationRecipients("A@example.org\na@example.org; b@example.org");
    expect(result.recipients).toEqual(["a@example.org","b@example.org"]);
    const draft=buildEngagementInvitation(def,"AbCdEf123456","https://example.org");
    const url=buildInvitationMailto(draft,result.recipients);
    expect(url.startsWith("mailto:?bcc=")).toBe(true);
    expect(url).not.toContain("&to=");
    expect(()=>buildInvitationMailto(draft,["not-an-address"])).toThrow();
    expect(()=>buildInvitationMailto(draft,["user@sample.demo"])).toThrow();
  });
  it("rejects oversized recipient lists rather than truncating",()=>{
    expect(parseInvitationRecipients(Array.from({length:21},(_,i)=>"person"+i+"@example.org").join(",")).tooMany).toBe(true);
  });
});
