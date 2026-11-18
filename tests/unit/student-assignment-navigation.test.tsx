import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { studentAssignmentHref, studentAssignmentDetailRoute } from "@/domain/student-assignment-navigation";
import { StudentAssignmentLink } from "@/components/student/StudentAssignmentLink";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search, children, ...props }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    children?: ReactNode;
  }) => {
    const path = to.replace(/\$([^/]+)/g, (_, key: string) =>
      encodeURIComponent(params?.[key] ?? key));
    const query = new URLSearchParams(Object.entries(search ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
    return <a href={path + (query ? "?" + query : "")} {...props}>{children}</a>;
  },
}));

describe("canonical student assignment navigation", () => {
  it("keeps only one detail route across student links", () => {
    expect(studentAssignmentDetailRoute).toBe("/student/assignments/$assessmentId");
    expect(studentAssignmentHref("essay-1")).toBe("/student/assignments/essay-1");
  });

  it("encodes assignment IDs and optional class return context", () => {
    expect(studentAssignmentHref("essay 1/?", {
      sectionId: "class one", filter: "feedback",
    })).toBe("/student/assignments/essay%201%2F%3F?section=class+one&filter=feedback");
  });

  it("renders a real detail link with class context and accessible anchor props", () => {
    const html = renderToStaticMarkup(
      <StudentAssignmentLink assessmentId="essay-1" sectionId="class-1"
        className="underline" aria-label="Review my essay" title="My essay">
        Essay feedback
      </StudentAssignmentLink>,
    );
    expect(html).toContain('href="/student/assignments/essay-1?section=class-1"');
    expect(html).toContain('aria-label="Review my essay"');
    expect(html).toContain('class="underline"');
    expect(html).toContain(">Essay feedback</a>");
  });

  it("preserves the list fallback when an assignment ID is unavailable", () => {
    // List navigation is distinct from an exact assignment detail destination.
    expect(studentAssignmentHref("upcoming")).not.toBe("/student/assignments");
  });
});
