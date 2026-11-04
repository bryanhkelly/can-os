import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const routerLocation = vi.hoisted(() => ({ pathname: "/operations/teacher-marketplace" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to, search }: { to: string; search?: { returnTo: string } }) =>
    createElement("div", { "data-to": to, ...(search ? { "data-return-to": search.returnTo } : {}) }),
  useLocation: () => ({
    pathname: routerLocation.pathname,
    searchStr: "?programId=demo",
    hash: "#matches",
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, role: "site_admin" } }),
}));

vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("./loader-error-state", () => ({
  LoaderErrorState: ({ fallback }: { fallback?: ReactNode }) =>
    createElement("div", null, fallback ?? "Permission denied"),
}));

import { LoaderFailure } from "./loader-failure";

describe("LoaderFailure", () => {
  it("defers missing-session navigation to the client effect", () => {
    routerLocation.pathname = "/operations/teacher-marketplace";
    const html = renderToStaticMarkup(createElement(LoaderFailure, {
      title: "Teacher marketplace",
      outcome: {
        authError: "Sign in to continue",
        message: "Sign in to continue",
        kind: "authentication",
      },
    }));

    expect(html).not.toContain('data-to="/access"');
    expect(html).toContain("Permission denied");
  });

  it("leaves permission failures to the post-login return boundary rather than choosing a role home", () => {
    routerLocation.pathname = "/safeguarding";
    const html = renderToStaticMarkup(createElement(LoaderFailure, {
      title: "Safeguarding",
      outcome: {
        authError: "You do not have permission",
        message: "You do not have permission",
        kind: "authorization",
      },
    }));

    expect(html).toContain("You do not have permission");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('data-to="/home"');
    expect(html).not.toContain('data-to="/access"');
    expect(html).not.toContain("Go to my workspace");
  });

  it("does not repeat the redirect when the workspace home is denied", () => {
    routerLocation.pathname = "/home";
    const html = renderToStaticMarkup(createElement(LoaderFailure, {
      title: "Operations",
      outcome: {
        authError: "You do not have permission",
        message: "You do not have permission",
        kind: "authorization",
      },
    }));

    expect(html).toContain("You do not have permission");
    expect(html).not.toContain('data-to="/home"');
  });
});
