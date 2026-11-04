import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  home: undefined as (() => ReactNode) | undefined,
  role: "site_admin",
  recovered: true,
  error: null as string | null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => { state.home = options.component; return {}; },
  useLocation: ({ select }: { select: (location: { state: { accessReturnFailed: boolean } }) => boolean }) =>
    select({ state: { accessReturnFailed: state.recovered } }),
  Navigate: ({ to }: { to: string }) => createElement("div", { "data-to": to }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => createElement("a", { href: to }, children),
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, role: state.role }, error: state.error }),
}));
vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({ title, children }: { title: ReactNode; children: ReactNode }) =>
    createElement("div", null, createElement("h1", null, title), children),
}));
import "@/routes/index";

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
  it("preserves ordinary home navigation outside recovery", () => {
    state.role = "site_admin";
    state.recovered = false;
    state.error = null;
    expect(renderToStaticMarkup(createElement(state.home!))).toContain('data-to="/home"');
  });
});
