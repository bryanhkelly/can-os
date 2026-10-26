import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  localSiteDelegationsQuery, sectionFacilitatorsQuery,
  siteStaffingKeys, siteStaffingMutationOptions, refreshSiteStaffing,
} from "@/modules/operations/site-staffing.queries";

const transport = vi.hoisted(() => ({ local: vi.fn(), sections: vi.fn() }));
vi.mock("@/modules/operations/site-local-delegation.functions", () => ({
  getLocalSiteDelegations: transport.local,
}));
vi.mock("@/modules/operations/site-section-facilitators.functions", () => ({
  getSectionFacilitatorPlanning: transport.sections,
}));

const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: 3 },
  } });
  clients.push(value);
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  transport.local.mockResolvedValue({ responsibilities: [], hasConfiguration: true });
  transport.sections.mockResolvedValue({ sections: [], hasConfiguration: true });
});
afterEach(() => { clients.splice(0).forEach(value => value.clear()); });

describe("site staffing query lifecycle", () => {
  it("keeps out-of-order Program reads in their own resource cache", async () => {
    const value = client(), a = deferred<object>(), b = deferred<object>();
    transport.local.mockImplementation(({ data }: { data: { programId: string } }) =>
      data.programId === "a" ? a.promise : b.promise);
    const first = value.fetchQuery({ ...localSiteDelegationsQuery("a"), gcTime: Infinity });
    const second = value.fetchQuery({ ...localSiteDelegationsQuery("b"), gcTime: Infinity });
    b.resolve({ hasConfiguration: true, owner: "b" });
    await second;
    expect(value.getQueryData(siteStaffingKeys.localDelegations("a"))).toBeUndefined();
    a.resolve({ hasConfiguration: true, owner: "a" });
    await first;
    expect(value.getQueryData(siteStaffingKeys.localDelegations("b"))).toEqual({ hasConfiguration: true, owner: "b" });
    expect(value.getQueryData(siteStaffingKeys.localDelegations("a"))).toEqual({ hasConfiguration: true, owner: "a" });
  });

  it("refreshes both active appointment panels after the first director is appointed", async () => {
    const value = client();
    transport.sections.mockResolvedValueOnce({ sections: [], hasConfiguration: false });
    const local = { ...localSiteDelegationsQuery("a"), staleTime: Infinity };
    const sections = { ...sectionFacilitatorsQuery("a"), staleTime: Infinity };
    await value.fetchQuery(local); await value.fetchQuery(sections);
    value.setQueryData(siteStaffingKeys.localDelegations("b"), { unrelated: true });
    const unlisten = [
      new QueryObserver(value, local).subscribe(() => {}),
      new QueryObserver(value, sections).subscribe(() => {}),
    ];
    try {
      transport.local.mockResolvedValue({ responsibilities: ["director"], hasConfiguration: true });
      transport.sections.mockResolvedValue({ sections: ["new-class"], hasConfiguration: true });
      const command = vi.fn().mockResolvedValue({ saved: true });
      const mutation = new MutationObserver(value, siteStaffingMutationOptions(value, "a", command));
      expect(await mutation.mutate({ action: "appoint" })).toEqual({
        result: { saved: true }, refreshWarning: null,
      });
      expect(transport.local).toHaveBeenCalledTimes(2);
      expect(transport.sections).toHaveBeenCalledTimes(2);
      expect(value.getQueryData(siteStaffingKeys.sectionFacilitators("a")))
        .toEqual({ sections: ["new-class"], hasConfiguration: true });
      expect(value.getQueryState(siteStaffingKeys.localDelegations("b"))?.isInvalidated).toBe(false);
    } finally { unlisten.forEach(stop => stop()); }
  });

  it("does not retry a failed command or refresh reads as though it saved", async () => {
    const value = client();
    const invalidate = vi.spyOn(value, "invalidateQueries");
    const command = vi.fn().mockRejectedValue(new Error("Assignment changed"));
    const mutation = new MutationObserver(value, siteStaffingMutationOptions(value, "a", command));
    await expect(mutation.mutate({ action: "appoint" })).rejects.toThrow("Assignment changed");
    expect(command).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps a successful save successful when the refresh fails", async () => {
    const value = client();
    const query = { ...localSiteDelegationsQuery("a"), staleTime: Infinity };
    await value.fetchQuery(query);
    const stop = new QueryObserver(value, query).subscribe(() => {});
    try {
      transport.local.mockRejectedValue(new Error("Read unavailable"));
      const command = vi.fn().mockResolvedValue({ saved: true });
      const mutation = new MutationObserver(value, siteStaffingMutationOptions(value, "a", command));
      const result = await mutation.mutate({ action: "revoke" });
      expect(result.result).toEqual({ saved: true });
      expect(result.refreshWarning).toContain("change was saved");
      expect(value.getQueryState(siteStaffingKeys.localDelegations("a"))?.status).toBe("error");
      expect(command).toHaveBeenCalledTimes(1);
      transport.local.mockResolvedValue({ responsibilities: [], hasConfiguration: true });
      await refreshSiteStaffing(value, "a");
      expect(value.getQueryState(siteStaffingKeys.localDelegations("a"))?.status).toBe("success");
      expect(command).toHaveBeenCalledTimes(1);
    } finally { stop(); }
  });

  it("keeps the Program busy until its dependent reads finish refreshing", async () => {
    const value = client(), refreshed = deferred<object>();
    const query = { ...sectionFacilitatorsQuery("a"), staleTime: Infinity };
    await value.fetchQuery(query);
    const stop = new QueryObserver(value, query).subscribe(() => {});
    try {
      transport.sections.mockReturnValue(refreshed.promise);
      const mutation = new MutationObserver(value,
        siteStaffingMutationOptions(value, "a", async () => ({ saved: true })));
      const saving = mutation.mutate({});
      await vi.waitFor(() => expect(transport.sections).toHaveBeenCalledTimes(2));
      expect(value.isMutating({ mutationKey: siteStaffingKeys.program("a") })).toBe(1);
      expect(value.isMutating({ mutationKey: siteStaffingKeys.program("b") })).toBe(0);
      refreshed.resolve({ sections: [] });
      await saving;
      expect(value.isMutating({ mutationKey: siteStaffingKeys.program("a") })).toBe(0);
    } finally { stop(); }
  });

  it("allows an explicit read retry to replace a preceding read error", async () => {
    const value = client(), query = localSiteDelegationsQuery("a");
    transport.local.mockRejectedValueOnce(new Error("Read unavailable"));
    await expect(value.fetchQuery(query)).rejects.toThrow("Read unavailable");
    await value.fetchQuery(query);
    expect(transport.local).toHaveBeenCalledTimes(2);
    expect(value.getQueryState(query.queryKey)?.status).toBe("success");
  });
});
