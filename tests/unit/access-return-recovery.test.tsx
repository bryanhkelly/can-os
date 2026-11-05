import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLoader } from "@/lib/safe-loader";

const state = vi.hoisted(() => ({
  matches: [] as { status: string; loaderData?: unknown }[],
  pathname: "/safeguarding",
  effects: [] as (() => void)[],
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void) => { state.effects.push(effect); },
}));
vi.mock("@/lib/use-hydrated", () => ({ useHydrated: () => true }));
vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  useMatches: ({ select }: { select: (matches: typeof state.matches) => boolean }) => select(state.matches),
  useLocation: ({ select }: { select: (location: { pathname: string }) => boolean }) =>
    select({ pathname: state.pathname }),
  Navigate: ({ to, replace, state: navigationState }: {
    to: string; replace: boolean; state: { accessReturnFailed: boolean };
  }) => createElement("div", { "data-to": to, "data-replace": replace,
    "data-recovered": navigationState.accessReturnFailed }),
  ErrorComponent: () => createElement("p", null, "Normal error"),
  Link: ({ to, children }: { to: string; children: ReactNode }) => createElement("a", { href: to }, children),
}));
import { AccessReturnError, AccessReturnNotFound, AccessReturnRecovery } from "@/lib/access-return-recovery";

function renderRecovery(children: ReactNode = "Requested page") {
  return renderToStaticMarkup(createElement(AccessReturnRecovery, { children }));
}
afterEach(() => {
  vi.unstubAllGlobals();
  state.effects = [];
  state.matches = [];
  state.pathname = "/safeguarding";
});

describe("post-sign-in return recovery", () => {
  it("renders branded unknown-page recovery separately from permission failures", () => {
    vi.stubGlobal("document", { cookie: "" });
    const html = renderToStaticMarkup(createElement(AccessReturnNotFound));
    expect(html).toContain("CAN OS");
    expect(html).toContain("404");
    expect(html).toContain("Page not found");
    expect(html).toContain('aria-label="Page recovery"');
    expect(html).toContain('href="/access"');
    expect(html).not.toContain("permission");
  });
  it.each(["FORBIDDEN", "AUTHENTICATION_REQUIRED", "UNAVAILABLE", "VALIDATION_FAILED", "CONFLICT", "UNEXPECTED"])(
    "sends a failed %s saved-page read home using actual router outcomes", async code => {
      const root = createRootRoute();
      const route = createRoute({ getParentRoute: () => root, path: "/safeguarding",
        loader: safeLoader(async () => { throw { code }; }, { onUnexpectedError: vi.fn() }) });
      const router = createRouter({ routeTree: root.addChildren([route]),
        history: createMemoryHistory({ initialEntries: ["/safeguarding"] }), isServer: true });
      await router.load();
      vi.stubGlobal("document", { cookie: "can_os_access_return=1" });
      state.matches = router.state.matches;
      const html = renderRecovery();
      expect(html).toContain('data-to="/"');
      expect(html).toContain('data-replace="true"');
      expect(html).toContain('data-recovered="true"');
      expect(html).not.toContain("Requested page");
    },
  );

  it.each(["error", "notFound"])("recovers a %s route", status => {
    vi.stubGlobal("document", { cookie: "can_os_access_return=1" });
    state.matches = [{ status }];
    expect(renderRecovery()).toContain('data-to="/"');
  });

  it("clears a successful return so later ordinary failures are not redirected", () => {
    const browserDocument = { cookie: "can_os_access_return=1" };
    vi.stubGlobal("document", browserDocument);
    state.matches = [{ status: "success", loaderData: { ok: true, data: [] } }];
    expect(renderRecovery()).toContain("Requested page");
    state.effects.forEach(effect => effect());
    expect(browserDocument.cookie).toContain("Max-Age=0");
    state.matches = [{ status: "error" }];
    expect(renderRecovery()).not.toContain('data-to="/"');
  });

  it("does not consume the return marker on an authentication page", () => {
    const browserDocument = { cookie: "can_os_access_return=1" };
    vi.stubGlobal("document", browserDocument);
    state.pathname = "/access/verify";
    state.matches = [{ status: "success" }];
    expect(renderRecovery()).toContain("Requested page");
    state.effects.forEach(effect => effect());
    expect(browserDocument.cookie).toBe("can_os_access_return=1");
  });

  it("recovers rendering errors as well as loader errors", () => {
    vi.stubGlobal("document", { cookie: "can_os_access_return=1" });
    expect(renderToStaticMarkup(createElement(AccessReturnError, { error: new Error("render failed") })))
      .toContain('data-to="/"');
  });

  it("recovers missing destinations", () => {
    vi.stubGlobal("document", { cookie: "can_os_access_return=1" });
    expect(renderToStaticMarkup(createElement(AccessReturnNotFound))).toContain('data-to="/"');
  });

  it("preserves error handling when not returning from sign-in", () => {
    vi.stubGlobal("document", { cookie: "" });
    expect(renderToStaticMarkup(createElement(AccessReturnError, { error: new Error("render failed") })))
      .toContain("Normal error");
  });
});
