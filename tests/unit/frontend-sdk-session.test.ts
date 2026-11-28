import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiResponseError, apiClientError, requireApiData, requireApiStatus } from "@/lib/api/api-response";
import { workspaceApiQueryKey, clearWorkspaceQueries } from "@/lib/api/workspace-query-scope";
import type { WorkspaceSession } from "@/modules/identity/workspace-session.server";

type Session = Extract<WorkspaceSession, { authenticated: true }>;
function session(overrides: Partial<Session> = {}): Session {
  return {
    authenticated: true, activeGrantId: "grant-a", role: "student",
    sites: [], programs: [],
    grants: [{ id: "grant-a", personId: "person-a", role: "student", firstName: "Synthetic", lastName: "Learner", organizationId: "org-a", siteId: "site-a" }],
    activeContext: { organizationIds: ["org-a"], siteIds: ["site-b", "site-a"], programIds: [] },
    ...overrides,
  } as Session;
}

describe("generated browser API response handling", () => {
  it.each([[401,"authentication"],[403,"authorization"],[400,"validation"],[409,"conflict"],[503,"unavailable"]] as const)(
    "classifies status %i without exposing response details", (status, kind) => {
      expect(apiClientError(new ApiResponseError(status)).kind).toBe(kind);
    },
  );
  it("does not infer expiry from network or parse failures", () => {
    expect(apiClientError(new Error("sensitive upstream detail")).kind).toBe("unavailable");
    expect(apiClientError(new Error("sensitive upstream detail")).message).not.toContain("sensitive");
  });
  it("rejects incorrect success status and missing data", () => {
    expect(() => requireApiStatus(new Response(null, { status: 200 }), 204)).toThrow(ApiResponseError);
    expect(() => requireApiData({ response: new Response(null, { status: 200 }) })).toThrow(ApiResponseError);
    expect(requireApiData({ response: new Response(null, { status: 200 }), data: 0 })).toBe(0);
  });
});

describe("verified workspace API cache", () => {
  it("normalizes order but isolates person, membership, role, scope and delegation", () => {
    const base = session();
    const key = workspaceApiQueryKey(base, "classes");
    expect(workspaceApiQueryKey(session({ activeContext: { ...base.activeContext, siteIds: ["site-a","site-b"] } }), "classes")).toEqual(key);
    expect(workspaceApiQueryKey(session({ grants: [{ ...base.grants[0]!, personId: "person-b" }] }), "classes")).not.toEqual(key);
    expect(workspaceApiQueryKey(session({ activeGrantId: "grant-b", grants: [{ ...base.grants[0]!, id: "grant-b" }] }), "classes")).not.toEqual(key);
    expect(workspaceApiQueryKey(session({ activeContext: { ...base.activeContext, siteIds: ["site-c"] } }), "classes")).not.toEqual(key);
    expect(workspaceApiQueryKey(session({ ownerDelegation: { mode: "read_only", expiresAt: new Date("2030-01-01T00:00:00Z") } } as Partial<Session>), "classes")).not.toEqual(key);
    expect(() => workspaceApiQueryKey(session({ grants: [] }), "classes")).toThrow();
  });
  it("cancels pending reads before clearing the query cache", async () => {
    const client = new QueryClient();
    const cancel = vi.spyOn(client, "cancelQueries");
    const clear = vi.spyOn(client, "clear");
    client.setQueryData(workspaceApiQueryKey(session(), "classes"), ["old"]);
    await clearWorkspaceQueries(client);
    expect(cancel).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(cancel.mock.invocationCallOrder[0]!).toBeLessThan(clear.mock.invocationCallOrder[0]!);
    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});
