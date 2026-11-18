import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync(
  new URL("../../src/components/learning/NoncreditEnrollmentManagement.tsx",import.meta.url),
  "utf8",
);

describe("noncredit registration and waitlist management reconciliation",()=>{
  it("uses the shared V6.1 mutation feedback component instead of bespoke saved-state flags",()=>{
    expect(source).toContain('import { MutationFeedback } from "@/components/workspace"');
    expect(source).toContain('useMutationFeedback(async()=>');
    expect(source).toContain('const changeBusy=mutation.pending||mutation.refreshFailed');
    expect(source).toContain('MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}');
    expect(source).not.toContain("withdrawBusy");
    expect(source).not.toContain("setNotice(");
  });

  it("invalidates the enrollment, waitlist and My Activity projections with surfaced failures",()=>{
    for(const key of [
      "my-noncredit-self-enrollments","my-noncredit-waitlist","my-activity",
    ]) expect(source).toContain('client.invalidateQueries({queryKey:["'+key+'"]},{throwOnError:true})');
    expect(source.match(/throwOnError:true/g)).toHaveLength(3);
  });

  it("withdraws through a single source command and preserves a saved result when readback fails",()=>{
    const section=source.slice(source.indexOf("  async function withdraw("),source.indexOf("  async function leaveWaitlist("));
    expect(section).toContain("mutation.run(");
    expect(section).toContain("withdrawMyNoncreditRegistration({data:{registrationId,confirm:true}})");
    expect(section).toContain("result.alreadyWithdrawn");
    expect(section).toContain("refreshErrorMessage:");
    expect(section).toContain('outcome.status==="saved"||outcome.status==="refresh-failed"');
    expect(section).not.toContain("client.invalidateQueries(");
    expect(section).not.toContain("catch(");
  });

  it("leaves a waiting list without reporting a saved cancellation as a failed decision",()=>{
    const section=source.slice(source.indexOf("  async function leaveWaitlist("),source.indexOf("  const visibleCourses="));
    expect(section).toContain("mutation.run(");
    expect(section).toContain("cancelMyNoncreditWaitlist({data:{releaseId}})");
    expect(section).toContain("refreshErrorMessage:");
    expect(section).toContain('outcome.status==="saved"||outcome.status==="refresh-failed"');
    expect(section).not.toContain("client.invalidateQueries(");
    expect(section).not.toContain("catch(");
  });

  it("blocks stale enrollment actions while refreshing saved decisions",()=>{
    expect(source).toContain("disabled={busy!==null||changeBusy}");
    expect(source).toContain("disabled={changeBusy||busy!==null}");
    expect(source).toContain('onClick={()=>void leaveWaitlist(item.releaseId)}');
    expect(source).toContain('onClick={()=>void withdraw(course.registrationId)}');
    expect(source).not.toContain("setBusy(item.releaseId)");
  });
});
