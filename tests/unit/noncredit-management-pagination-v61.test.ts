import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const management=readFileSync(
  new URL("../../src/components/learning/NoncreditEnrollmentManagement.tsx",import.meta.url),"utf8",
);
const history=readFileSync(
  new URL("../../src/modules/enrollment/noncredit-self-enrollment.functions.ts",import.meta.url),"utf8",
);

describe("adult learner registration management",()=>{
  it("loads the source-owned history by cursor instead of silently truncating at 100",()=>{
    expect(management).toContain("useInfiniteQuery({");
    expect(management).toContain("getMyNoncreditSelfEnrollmentHistoryPage({data:{cursor:pageParam}})");
    expect(management).toContain("getNextPageParam:last=>last.nextCursor??undefined");
    expect(management).toContain("query.data?.pages.flatMap(page=>page.items)");
    expect(management).toContain("query.fetchNextPage()");
    expect(management).toContain("Load older registrations");
    expect(management).not.toContain("getMyNoncreditSelfEnrollments()");
    expect(history).toContain("export const getMyNoncreditSelfEnrollmentHistoryPage");
  });

  it("keeps exact Person-bound registration reads for embedded My Activity controls",()=>{
    expect(management).toContain("getMyNoncreditRegistrationById({data:{registrationId}})");
    expect(management).toContain('["my-noncredit-self-enrollments",scopeKey,registrationId??"all"]');
    expect(management).toContain("enabled:authorized&&!releaseId");
    expect(history).toContain("registrationId?eq(noncreditRegistrations.id,registrationId):undefined");
    expect(history).toContain("eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId)");
  });

  it("reuses shared V6.1 states without changing withdrawal and waiting-list commands",()=>{
    expect(management).toContain("<QueryState");
    expect(management).toContain("<EmptyState");
    expect(management).toContain("<StatusBadge");
    expect(management).toContain("<WorkspaceNotice");
    expect(management).toContain("withdrawMyNoncreditRegistration({data:{registrationId,confirm:true}})");
    expect(management).toContain("cancelMyNoncreditWaitlist({data:{releaseId}})");
    expect(management).toContain("query.isFetchNextPageError");
  });
});
