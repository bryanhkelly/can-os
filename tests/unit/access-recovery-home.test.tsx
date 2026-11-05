import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type RootLoaderInput = {
  context: { queryClient: { fetchQuery: (options: unknown) => Promise<{ session: { authenticated: boolean; role: string } | null; error?: string | null }> } };
  location: { state: { accessReturnFailed?: boolean } };
};

const state = vi.hoisted(() => ({
  home: undefined as (() => ReactNode) | undefined,
  loader: undefined as ((input: RootLoaderInput) => Promise<unknown>) | undefined,
  role: "site_admin",
  recovered: true,
  error: null as string | null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode; loader?: (input: RootLoaderInput) => Promise<unknown> }) => {
    state.home = options.component;
    state.loader = options.loader;
    return {};
  },
  redirect: (options: { to: string; search?: Record<string, string> }) => ({ isRedirect: true, ...options }),
  useLocation: ({ select }: { select: (location: { state: { accessReturnFailed: boolean } }) => boolean }) =>
    select({ state: { accessReturnFailed: state.recovered } }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => createElement("a", { href: to }, children),
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, role: state.role }, error: state.error }),
  workspaceSessionQueryOptions: () => ({ queryKey: ["workspace-session"] }),
}));
vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({ title, children }: { title: ReactNode; children: ReactNode }) =>
    createElement("div", null, createElement("h1", null, title), children),
}));
import "@/routes/index";

async function loadRoot(session: { authenticated: boolean; role: string } | null,
  recovered = false, error: string | null = null) {
  if (!state.loader) throw new Error("Missing root loader");
  const result = { session, error };
  const fetchQuery = vi.fn().mockResolvedValue(result);
  try {
    await state.loader({
      context: { queryClient: { fetchQuery } },
      location: { state: { accessReturnFailed: recovered } },
    });
  } catch (outcome) {
    return outcome;
  }
  return null;
}

describe("recovery home", () => {
  it.each(["site_admin", "student", "teacher", "guardian", "room_facilitator", "unknown_role"])(
    "renders home without loading or forwarding into the %s workspace", role => {
      state.role = role;
      state.recovered = true;
      state.error = null;
      const html = renderToStaticMarkup(createElement(state.home!));
      expect(html).toContain("<h1>Home</h1>");
      expect(html).not.toContain("data-to=");
    },
  );
  it("still renders recovery home if the workspace session read fails", () => {
    state.error = "Unable to refresh your workspace session";
    expect(renderToStaticMarkup(createElement(state.home!))).toContain("<h1>Home</h1>");
  });
  it.each([["student", "/home"], ["teacher", "/home"], ["guardian", "/home"]])(
    "redirects an authenticated %s to its canonical home before rendering", async (role, destination) => {
      expect(await loadRoot({ authenticated: true, role })).toMatchObject({ to: destination });
    },
  );
  it("redirects an unauthenticated session to sign-in", async () => {
    expect(await loadRoot({ authenticated: false, role: "student" })).toMatchObject({
      to: "/access", search: { returnTo: "/" },
    });
  });
  it("does not redirect during post-sign-in recovery or a failed session read", async () => {
    expect(await loadRoot({ authenticated: true, role: "student" }, true)).toBeNull();
    expect(await loadRoot({ authenticated: true, role: "student" }, false, "session unavailable")).toBeNull();
  });
});
