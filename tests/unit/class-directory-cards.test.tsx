import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassDirectoryCards } from "@/components/learning/ClassDirectoryCards";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, className, children }: {
    to: string;
    search?: Record<string, string | undefined>;
    className?: string;
    children: ReactNode;
  }) => {
    const query = new URLSearchParams(Object.entries(search ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    )).toString();
    return <a href={to + (query ? `?${query}` : "")} className={className}>{children}</a>;
  },
}));

describe("ClassDirectoryCards", () => {
  it("uses shared workspace-panel cards and preserves role-scoped class links", () => {
    const teacher = renderToStaticMarkup(<ClassDirectoryCards classes={[
      { id: "section-id", title: "Biology", code: "BIO" },
    ]} role="teacher"/>);
    expect(teacher).toContain('class="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm');
    expect(teacher).toContain('class="text-base font-semibold">Biology</h2>');
    expect(teacher).toContain("Open class");
    expect(teacher).toContain('href="/classes?section=section-id"');
    expect(teacher).toContain("Biology");
    expect(teacher).not.toContain("font-serif text-2xl");

    const guardian = renderToStaticMarkup(<ClassDirectoryCards classes={[
      { id: "section-id", title: "Biology", code: "BIO", studentPersonId: "student-id", studentName: "Jordan" },
    ]} role="guardian"/>);
    expect(guardian).toContain('href="/classes?section=section-id&amp;student=student-id"');
    expect(guardian).toContain("Jordan");
  });
});
