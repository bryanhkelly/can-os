import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { getTeacherToday } from "@/modules/learning/teacher-today.functions";

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options, useLoaderData: () => state.data, useSearch: () => ({}),
  }),
  Link: ({ to, search, children, ...props }: {
    to: string; search?: Record<string, string>; children: ReactNode;
  }) => <a href={to + (search ? `?${new URLSearchParams(search)}` : "")} {...props}>{children}</a>,
}));
vi.mock("@/modules/learning/teacher-today.functions", () => ({ getTeacherToday: vi.fn() }));
vi.mock("@/modules/learning/teacher-learning-evidence.functions", () => ({ getTeacherLearningEvidence: vi.fn() }));
vi.mock("@/components/teacher/TeacherDaySchedule", () => ({ TeacherDaySchedule: () => <section>Authorized teacher schedule</section> }));
vi.mock("@/components/learning/TeacherGradeResponsesPanel", () => ({ TeacherGradeResponsesPanel: () => <p>Guardian questions</p> }));
vi.mock("@/components/learning/TeacherLearningFollowUpForm", () => ({ TeacherLearningFollowUpForm: () => null }));
vi.mock("@/components/learning/TeacherLearningFollowUpsPanel", () => ({ TeacherLearningFollowUpsPanel: () => null }));
vi.mock("@/components/teacher/TeacherConferencePanel", () => ({ TeacherConferencePanel: () => null }));

import { TeacherHome } from "@/components/home/TeacherHome";

const today: Awaited<ReturnType<typeof getTeacherToday>> = {
  connected: true, teacher: { firstName: "Avery" },
  sections: [{ id: "english", title: "English Literature", studentCount: 0, classroom: null }],
  ungraded: [{
    sectionId: "english", assessmentId: "essay", studentProfileId: "learner", studentName: "Synthetic learner",
    assessmentTitle: "Essay", sectionTitle: "English Literature", submittedAt: "2030-01-01T12:00:00Z",
  }],
  missingWork: [], notices: [],
};

function render(data: typeof today) {
  return renderToStaticMarkup(<TeacherHome outcome={{ ok: true, data }} />);
}

describe("teacher dashboard migration", () => {
  it("keeps exact grading and class destinations in the shared student layout", () => {
    const html = render(today);
    expect(html).toContain("role-dashboard");
    expect(html).toContain("can-dashboard-hero");
    expect(html).toContain("Your teaching day");
    expect(html).toContain("Welcome, Avery.");
    expect(html).toContain("English Literature");
    expect(html).toContain('href="/teacher/gradebook?section=english&amp;assessment=essay"');
    expect(html).toContain('href="/messages"');
    expect(html).toContain('href="/calendar?view=agenda"');
    expect(html.indexOf("Authorized teacher schedule")).toBeGreaterThan(html.indexOf("<aside"));
    expect(html.match(/<main\b/g)).toHaveLength(1);
  });

  it("does not show a grading success or empty queue when the reader is disconnected", () => {
    const html = render({ ...today, connected: false });
    expect(html).toContain("Today&#x27;s snapshot cannot load.");
    expect(html).not.toContain("Grade next submission");
    expect(html).not.toContain("No grading or missing-work items");
    expect(html).not.toContain("Authorized teacher schedule");
  });
});
