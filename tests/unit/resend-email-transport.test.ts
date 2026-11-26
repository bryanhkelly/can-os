import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitResendEmail, type ResendEmailPayload } from "@/modules/communication/resend-email-transport.server";

const message:ResendEmailPayload={from:"sender@school.org",to:["reader@school.org"],subject:"Notice",text:"Information"};
const send=vi.fn<typeof fetch>();
beforeEach(()=>{send.mockReset();vi.stubGlobal("fetch",send);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("shared email provider boundary",()=>{
  it.each(["user@school.demo","user@nested.school.DEMO","user@school.demo ",
    "Name <user@school.demo>","user@school.demo.","a@school.org,b@school.demo","user@school.org\nBcc: user@school.demo"])(
    "rejects non-deliverable or malformed destination %s before transport",async to=>{
      await expect(submitResendEmail({...message,to:[to]},"fake-key")).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });
  it("requires a configured key",async()=>{
    await expect(submitResendEmail(message,"")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects multi-recipient payloads even when runtime input bypasses the tuple type",async()=>{
    const unsafe={...message,to:["one@school.org","two@school.org"]} as unknown as ResendEmailPayload;
    await expect(submitResendEmail(unsafe,"fake-key")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("preserves provider responses, attachment metadata, tags, idempotency and timeout",async()=>{
    const response=new Response('{"id":"provider-id"}',{status:202});
    send.mockResolvedValue(response);
    const signal=new AbortController().signal;
    const timeout=vi.spyOn(AbortSignal,"timeout").mockReturnValue(signal);
    const payload={...message,attachments:[{filename:"logo.png",content:"AA==",content_id:"school-logo"}],
      tags:[{name:"can_source",value:"notice"}]};
    expect(await submitResendEmail(payload,"fake-key","request-key")).toBe(response);
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(send).toHaveBeenCalledWith("https://api.resend.com/emails",expect.objectContaining({
      method:"POST",redirect:"error",signal,
      headers:expect.objectContaining({"Idempotency-Key":"request-key"}),
      body:JSON.stringify(payload),
    }));
  });
  it("returns rate-limit responses for the owning retry policy",async()=>{
    const response=new Response("",{status:429,headers:{"retry-after":"60"}});
    send.mockResolvedValue(response);
    expect(await submitResendEmail(message,"fake-key")).toBe(response);
  });
});
