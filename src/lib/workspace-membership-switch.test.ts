import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { switchVerifiedMembership } from "./workspace-membership-switch";

const grants = [
  { id: "grant-active", role: "registrar" },
  { id: "grant-target", role: "teacher" },
];

afterEach(() => vi.unstubAllGlobals());

describe("switchVerifiedMembership", () => {
  it("posts the verified grant, clears cached data, and redirects locally", async () => {
    const assign = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(["private-data"], { value: "prior membership" });
    vi.stubGlobal("window", { location: { origin: "https://can.example", assign } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await switchVerifiedMembership({
      grants, activeGrantId: "grant-active", grantId: "grant-target", queryClient,
      redirectTo: "/site-website?siteId=site-1#editor",
    });

    expect(fetch).toHaveBeenCalledWith("/access/session", expect.objectContaining({
      method: "POST", body: JSON.stringify({ grantId: "grant-target" }),
    }));
    expect(queryClient.getQueryData(["private-data"])).toBeUndefined();
    expect(assign).toHaveBeenCalledWith("/site-website?siteId=site-1#editor");
  });

  it("rejects unavailable grants and external redirects before switching", async () => {
    const assign = vi.fn();
    const fetchMock = vi.fn();
    const queryClient = new QueryClient();
    vi.stubGlobal("window", { location: { origin: "https://can.example", assign } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(switchVerifiedMembership({
      grants, activeGrantId: "grant-active", grantId: "missing", queryClient,
    })).rejects.toThrow("This membership is unavailable.");
    await expect(switchVerifiedMembership({
      grants, activeGrantId: "grant-active", grantId: "grant-target", queryClient,
      redirectTo: "https://outside.example/",
    })).rejects.toThrow("The requested destination is unavailable.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});