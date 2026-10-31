import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", { href: "/access" }, children),
}));

import { LoaderErrorState } from "./loader-error-state";

describe("LoaderErrorState", () => {
  it("renders authentication guidance in an embedded panel", () => {
    const html = renderToStaticMarkup(createElement(LoaderErrorState, {
      outcome: { authError: "Sign in to continue", message: "Sign in to continue", kind: "authentication" },
    }));
    expect(html).toContain("Sign in to continue");
    expect(html).toContain("Sign in or request access");
  });

  it("does not suggest signing in for permission denial", () => {
    const html = renderToStaticMarkup(createElement(LoaderErrorState, {
      outcome: { authError: "Access denied", message: "Access denied", kind: "authorization" },
    }));
    expect(html).toContain("Access denied");
    expect(html).not.toContain("Sign in or request access");
  });

  it("only offers retry for retryable outcomes", () => {
    const retry = vi.fn();
    const retryable = renderToStaticMarkup(createElement(LoaderErrorState, {
      outcome: { authError: null, message: "Unavailable", kind: "unavailable", retryable: true },
      onRetry: retry,
    }));
    const permanent = renderToStaticMarkup(createElement(LoaderErrorState, {
      outcome: { authError: null, message: "Denied", kind: "authorization", retryable: false },
      onRetry: retry,
    }));
    expect(retryable).toContain("Retry");
    expect(permanent).not.toContain("Retry");
  });
});
