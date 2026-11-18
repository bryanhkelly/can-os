import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { noncreditWaitlistQueryKeys } from "@/domain/noncredit-waitlist-query-keys";

describe("noncredit waitlist cache isolation", () => {
  const scope = "verified-grant-1";
  const releaseId = "7fda2bf2-1328-4894-906c-9ac9c36fb471";

  it("never aliases an exact release DTO with paginated waiting-list history", () => {
    const client = new QueryClient();
    const detailKey = noncreditWaitlistQueryKeys.detail(scope, releaseId);
    const pageKey = noncreditWaitlistQueryKeys.pages(scope, releaseId);
    const detail = { releaseId, invitationActive: true };
    const history = { pages: [{ items: [detail], nextCursor: null }], pageParams: [null] };
    expect(detailKey).not.toEqual(pageKey);

    client.setQueryData(detailKey, detail);
    client.setQueryData(pageKey, history);

    expect(client.getQueryData(detailKey)).toEqual(detail);
    expect(client.getQueryData(pageKey)).toEqual(history);
    expect(client.getQueryData(detailKey)).not.toHaveProperty("pages");
    expect(client.getQueryData(pageKey)).toHaveProperty("pages");
    client.clear();
  });

  it("separates all-history queries from individual release queries and grant scopes", () => {
    expect(noncreditWaitlistQueryKeys.pages(scope)).not.toEqual(
      noncreditWaitlistQueryKeys.detail(scope, releaseId),
    );
    expect(noncreditWaitlistQueryKeys.pages(scope)).not.toEqual(
      noncreditWaitlistQueryKeys.pages("different-grant"),
    );
    expect(noncreditWaitlistQueryKeys.detail(scope, releaseId)).not.toEqual(
      noncreditWaitlistQueryKeys.detail("different-grant", releaseId),
    );
  });

  it("retains the shared invalidation prefix across both data shapes", async () => {
    const client = new QueryClient();
    const detailKey = noncreditWaitlistQueryKeys.detail(scope, releaseId);
    const pageKey = noncreditWaitlistQueryKeys.pages(scope);
    client.setQueryData(detailKey, { invitationActive: true });
    client.setQueryData(pageKey, { pages: [], pageParams: [] });
    await client.invalidateQueries({ queryKey: noncreditWaitlistQueryKeys.root });
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(pageKey)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("wires the detail reader and infinite history reader to their respective keys", () => {
    const registration = readFileSync(
      new URL("../../src/routes/learn.enroll.tsx", import.meta.url), "utf8",
    );
    const management = readFileSync(
      new URL("../../src/components/learning/NoncreditEnrollmentManagement.tsx", import.meta.url), "utf8",
    );
    expect(registration).toContain("queryKey:noncreditWaitlistQueryKeys.detail(");
    expect(registration).toContain("getMyNoncreditWaitlistByRelease({data:{releaseId:selected!.id}})");
    expect(management).toContain("queryKey:noncreditWaitlistQueryKeys.pages(scopeKey,releaseId)");
    expect(management).toContain("getMyNoncreditWaitlistPage({data:{cursor:pageParam}})");
    expect(registration).toContain('invalidateQueries({queryKey:["my-noncredit-waitlist"]}');
    expect(management).toContain('invalidateQueries({queryKey:["my-noncredit-waitlist"]}');
  });
});
