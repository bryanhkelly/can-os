import { describe, expect, it } from "vitest";
import { writtenSubmissionResponse } from "@/domain/submission-response";

const first="11111111-1111-4111-8111-111111111111";
const second="22222222-2222-4222-8222-222222222222";

describe("P0 learner revision attachments",()=>{
  it("keeps only canonical attached documents when autosaving a draft",()=>{
    expect(writtenSubmissionResponse({
      text:"Old response",draft:false,
      attachments:[first,second,first,"not-an-attachment"],
      untrustedField:"do not forward",
    },"Revised explanation",true)).toEqual({
      text:"Revised explanation",draft:true,
      attachments:[first,second],
    });
  });
  it("keeps verified files when finalizing the same attempt, but clears draft status",()=>{
    const draft=writtenSubmissionResponse({attachments:[first]}, "First draft",true);
    expect(writtenSubmissionResponse(draft,"Final student response")).toEqual({
      text:"Final student response",attachments:[first],
    });
  });
  it("never copies prior-attempt documents into a new revision",()=>{
    expect(writtenSubmissionResponse(undefined,"New attempt",true)).toEqual({
      text:"New attempt",draft:true,
    });
    expect(writtenSubmissionResponse(null,"Submitted revision")).toEqual({
      text:"Submitted revision",
    });
  });
});
