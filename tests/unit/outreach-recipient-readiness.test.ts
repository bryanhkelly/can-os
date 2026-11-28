import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const source=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("outreach recipient readiness source contracts",()=>{
  it("renders recipient fields and native workspace independently of invitation verification",()=>{
    const ui=source("src/components/launch-studio/EngagementEmailDistribution.tsx");
    expect(ui).toContain('invitationReady={!!draft}');
    expect(ui).not.toContain('{draft&&<NativeEngagementCampaigns');
    expect(ui).toContain('disabled={!draft||busy||copying}');
    expect(ui).not.toContain('setRecipients("");setAuthorized');
    const native=source("src/components/launch-studio/NativeEngagementCampaigns.tsx");
    expect(source("src/components/communication/EmailRecipientField.tsx")).toContain('label="Recipient email addresses"');
    expect(native.indexOf("<EmailRecipientField")).toBeLessThan(native.indexOf('{data&&<>'));
    expect(ui).not.toContain("<Textarea");
    expect(ui).toContain("recipientDraft={recipients}");
    expect(native).toContain("useDirect?{raw,consentSource:source");
    expect(native).toContain('when?"Schedule email":"Send email"');
    expect(native).toContain('disabled={!data||!valid||busy||importing}');
    expect(native).toContain('disabled={!invitationReady||!data.senderReady');
  });
  it("sets a canonical public origin without trusting incoming production hosts",()=>{
    const config=source("wrangler.jsonc");
    expect(JSON.parse(config).vars.CAN_ACCESS_PUBLIC_ORIGIN).toBe("https://can-os.bryanhkelly.workers.dev");
    const server=source("src/modules/engagement/go-link-share-origin.functions.ts");
    expect(server).toContain('process.env.NODE_ENV==="development"');
    expect(server).toContain('Approved application share origin not configured');
  });
});
