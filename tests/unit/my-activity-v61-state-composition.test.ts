import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/routes/learn.my-activity.tsx", import.meta.url), "utf8");
const page = source.slice(source.indexOf("function MyActivityPage()"));

describe("My Activity V6.1 read-model state composition", () => {
  it("uses shared loading and retry UI without removing fallback enrollment management", () => {
    expect(source).toContain('QueryState, EmptyState, WorkspaceNotice');
    expect(page).toContain("<QueryState");
    expect(page).toContain('loading={activity.isPending?');
    expect(page).toContain('error={activity.isError?');
    expect(page).toContain("Your registrations remain source-authoritative.");
    expect(page).toContain("onRetry={()=>void activity.refetch()}");
    expect(page).toContain('id="noncredit-management"');
    expect(page).toContain("showAllTraining&&<NoncreditEnrollmentManagement/>");
  });

  it("distinguishes partial coverage and unavailable sources from empty participation", () => {
    expect(page).toContain('partialSources.length > 0 && <WorkspaceNotice tone="info"');
    expect(page).toContain('unavailable.length > 0 && <WorkspaceNotice tone="attention"');
    expect(page).toContain("This view does not certify missing records as nonexistent.");
    expect(page).toContain('Link to="/class"');
    expect(page).toContain('<EmptyState kind="matches"');
    expect(page).toContain("No verified participation matches these filters in the active workspace.");
    expect(page).toContain("Some sources are unavailable, so this view may be incomplete.");
  });

  it("preserves source-owned history pagination and displays retryable partial failure", () => {
    expect(page).toContain('getMyActivitySourcePage({data:{source,cursor}})');
    expect(page).toContain('getMyActivityOpportunityPage({data:{cursor:nextOpportunityCursor}})');
    expect(page).toContain('assertParticipationHistoryPage({');
    expect(page).toContain('olderError&&<WorkspaceNotice tone="attention"');
    expect(page).toContain("canLoadOlder");
    expect(page).toContain("Load older activity");
  });
});
