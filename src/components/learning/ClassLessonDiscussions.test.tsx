import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClassLessonDiscussions } from "./ClassLessonDiscussions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
type Thread = Parameters<typeof ClassLessonDiscussions>[0]["threads"][number];

describe("class lesson discussions", () => {
  it("shows an empty state without manufacturing a discussion", () => {
    const html=renderToStaticMarkup(<ClassLessonDiscussions
      threads={[]} role="student" sectionId="section-1" lessonId="lesson-1"/>);
    expect(html).toContain("No discussion has been opened");
    expect(html).not.toContain("Start a discussion from this lesson");
  });
  it("preserves read-only locked threads and teacher navigation", () => {
    const threads=[{id:"thread-1",title:"Reflect on sources",locked:true,lessonId:null}] as unknown as Thread[];
    const html=renderToStaticMarkup(<ClassLessonDiscussions
      threads={threads} role="teacher" sectionId="section-1" lessonId="lesson-1"/>);
    expect(html).toContain("Locked");
    expect(html).toContain("Class-wide discussion");
    expect(html).toContain("Start a discussion from this lesson");
  });
});
