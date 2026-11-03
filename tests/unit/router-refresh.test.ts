import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { safeLoader } from "@/lib/safe-loader";
import { assertRefreshResult, assertRouterRefresh, invalidateRouterAndCheck } from "@/lib/router-refresh";
import { createMutationRunner } from "@/lib/mutation-feedback";

describe("verified refresh outcomes", () => {
  it.each([
    { ok: false, kind: "unavailable" },
    { session: null, error: "Unable to load session" },
    { isError: true, error: new Error("offline") },
    { connected: false, items: [] },
    { ok: true, data: { connected: false, items: [] } },
    { isError: false, data: { connected: false, items: [] } },
  ])("rejects unsuccessful reads returned as values", result => {
    expect(() => assertRefreshResult(result)).toThrow();
    expect(() => assertRouterRefresh([{ id: "/", status: "success", loaderData: result }])).toThrow();
  });

  it.each([undefined, { ok: true, data: [] }, { session: { authenticated: false }, error: null },
    { isError: false, data: [] }, { connected: true, items: [] },
    { ok: true, data: { connected: true, items: [] } }])("accepts successful reads, including legitimate empty results", result => {
    expect(() => assertRefreshResult(result)).not.toThrow();
    expect(() => assertRouterRefresh([{ id: "/", status: "success", loaderData: result }])).not.toThrow();
  });

  it.each(["error", "notFound", "pending"])("rejects a %s route after refresh", status => {
    expect(() => assertRouterRefresh([{ id: "/", status }])).toThrow();
  });

  it("detects safeLoader failure with the actual router and retries reads without rerunning the command", async () => {
    let unavailable = false;
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root, path: "/",
      loader: safeLoader(async () => {
        if (unavailable) throw { code: "UNAVAILABLE" };
        return { record: "saved" };
      }),
    });
    const router = createRouter({ routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
    await router.load();
    unavailable = true;
    const command = vi.fn(async () => "receipt");
    const run = createMutationRunner({ refresh: () => invalidateRouterAndCheck(router), update: () => {} });
    const options = { successMessage: "Saved.", commandErrorMessage: "Could not save." };
    expect(await run(command, options)).toEqual({ status: "refresh-failed", value: "receipt" });
    expect(await run(command, options)).toEqual({ status: "refresh-required" });
    unavailable = false;
    expect(await run.retryRefresh()).toEqual({ status: "refreshed" });
    expect(command).toHaveBeenCalledOnce();
  });
});
