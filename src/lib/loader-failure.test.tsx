import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to, search }: { to: string; search: { returnTo: string } }) =>
    createElement("div", { "data-to": to, "data-return-to": search.returnTo }),
  useLocation: () => ({
    pathname: "/operations/teacher-marketplace",
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

  it("does not redirect permission denials to sign-in", () => {
    const html = renderToStaticMarkup(createElement(LoaderFailure, {
      title: "Teacher marketplace",
      outcome: {
        authError: "You do not have permission",
        message: "You do not have permission",
        kind: "authorization",
      },
    }));

    expect(html).toContain("You do not have permission");
    expect(html).toContain('href="/operations"');
    expect(html).toContain("Go to my workspace");
    expect(html).not.toContain('data-to="/access"');
  });
});
