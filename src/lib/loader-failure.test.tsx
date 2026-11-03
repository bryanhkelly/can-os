import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to, search }: { to: string; search: { returnTo: string } }) =>
    createElement("div", { "data-to": to, "data-return-to": search.returnTo }),
  useLocation: () => ({
    pathname: "/operations/teacher-marketplace",
    searchStr: "?programId=demo",
    hash: "#matches",
  }),
}));

vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("./loader-error-state", () => ({
  LoaderErrorState: () => createElement("p", null, "Permission denied"),
}));

import { LoaderFailure } from "./loader-failure";

describe("LoaderFailure", () => {
  it("redirects missing sessions to sign-in with the full current route", () => {
    const html = renderToStaticMarkup(createElement(LoaderFailure, {
      title: "Teacher marketplace",
      outcome: {
        authError: "Sign in to continue",
        message: "Sign in to continue",
        kind: "authentication",
      },
    }));

    expect(html).toContain('data-to="/access"');
    expect(html).toContain('data-return-to="/operations/teacher-marketplace?programId=demo#matches"');
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

    expect(html).toContain("Permission denied");
    expect(html).not.toContain('data-to="/access"');
  });
});
