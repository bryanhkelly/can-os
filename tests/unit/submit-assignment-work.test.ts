import { describe, expect, it, vi } from "vitest";
import { saveAssignmentWork, submitAssignmentWork } from "@/modules/student-experience/submit-assignment-work";
describe("complete assignment submission", () => {
  it("saves a draft with attachments without submitting and resumes after a partial upload", async () => {
    const pending = ["essay", "diagram"];
    const attached = vi.fn((file:string) => { pending.splice(pending.indexOf(file),1); });
    const attach = vi.fn(async (file:string) => { if(file === "diagram") throw new Error("offline"); });
    const input = { files:[...pending], saveDraft:async()=>({saved:true}), attach, attached };
    await expect(saveAssignmentWork(input)).rejects.toThrow("offline");
    expect(pending).toEqual(["diagram"]);
    attach.mockImplementation(async()=>{});
    await expect(saveAssignmentWork({...input,files:[...pending]})).resolves.toEqual({saved:true});
    expect(pending).toEqual([]);
    expect(attach.mock.calls.map(call=>call[0])).toEqual(["essay","diagram","diagram"]);
  });
  it("returns a durable receipt only after draft and every file are saved", async () => {
    const events: string[] = [];
    const receipt = await submitAssignmentWork({
      files: ["essay", "diagram"],
      saveDraft: async () => { events.push("draft"); },
      attach: async file => { events.push(file); },
      attached: file => { events.push("saved:"+file); },
      submit: async () => { events.push("submit"); return { submissionId: "receipt" }; },
    });
    expect(events).toEqual(["draft", "essay", "saved:essay", "diagram", "saved:diagram", "submit"]);
    expect(receipt).toEqual({ submissionId: "receipt" });
  });
  it("keeps failed files pending and never submits incomplete work", async () => {
    const pending = ["essay", "diagram"];
    const submit = vi.fn();
    await expect(submitAssignmentWork({
      files: [...pending], saveDraft: async () => {},
      attach: async file => { if(file==="diagram") throw new Error("offline"); },
      attached: file => { pending.splice(pending.indexOf(file),1); }, submit,
    })).rejects.toThrow("offline");
    expect(pending).toEqual(["diagram"]);
    expect(submit).not.toHaveBeenCalled();
  });
  it("does not upload files when the draft cannot be saved", async () => {
    const attach = vi.fn(), submit = vi.fn();
    await expect(submitAssignmentWork({ files: ["essay"],
      saveDraft: async () => { throw new Error("closed"); },
      attach, attached: vi.fn(), submit,
    })).rejects.toThrow("closed");
    expect(attach).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
