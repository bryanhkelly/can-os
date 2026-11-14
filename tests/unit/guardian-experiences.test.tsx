import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  routeOptions: null as Record<string, unknown> | null,
  loaderOutcome: null as unknown,
  getSchoolExperiences: vi.fn(),
  getMySchoolProfile: vi.fn(),
  bookOfficeHour: vi.fn(),
  rescheduleOfficeHour: vi.fn(),
  cancelOfficeHour: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    state.routeOptions = options;
    return { options, useLoaderData: () => state.loaderOutcome, useSearch: () => ({}) };
  },
  useSearch: () => ({}),
  useRouter: () => ({ invalidate: vi.fn() }),
  linkOptions: (options: unknown) => options,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock("@/modules/operations/school-profile.functions", () => ({
  getSchoolProfile: vi.fn(), getMySchoolProfile: state.getMySchoolProfile,
}));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  getSchoolExperiences: state.getSchoolExperiences,
  bookOfficeHour: state.bookOfficeHour,
  rescheduleOfficeHour: state.rescheduleOfficeHour,
  cancelOfficeHour: state.cancelOfficeHour,
}));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({
  getGuardianStudents: vi.fn().mockResolvedValue({ students: [] }),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({
  readNotification: vi.fn(),
}));

import { Route as GuardianExperiencesRoute } from "@/routes/guardian.experiences";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";

const guardianData = {
  connected: true,
  viewerRole: "guardian" as const,
  events: [],
  notices: [],
  slots: [{ id: "slot-1", seriesId: "series-1", startsAt: "2027-11-10T22:00:00.000Z", endsAt: "2027-11-10T22:20:00.000Z", status: "available",
    siteId: "synthetic-site-1", sectionId: null, eligibleStudentPersonIds: ["student-1"],
    seriesTitle:"Synthetic office hours",teacherName:"Synthetic Teacher",timezone:"America/Los_Angeles" }],
  recentConferenceNotes: [{ id: "note-1", bookingId: "booking-1", studentPersonId: "student-1",
    status: "held", startsAt: "2027-11-09T22:00:00.000Z", seriesTitle: "Synthetic office hours",
    timezone: "America/Los_Angeles", note: "We agreed on a reading goal.", teacherName: "Synthetic Teacher" }],
  bookings: [{ id: "booking-1", slotId: "slot-2", studentPersonId: "student-1", seriesId: "series-1", startsAt: "2027-11-11T22:00:00.000Z", endsAt: "2027-11-11T22:20:00.000Z",
    seriesTitle:"Synthetic office hours",teacherName:"Synthetic Teacher",timezone:"America/Los_Angeles" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.getSchoolExperiences.mockResolvedValue(guardianData);
  state.getMySchoolProfile.mockResolvedValue(null);
  state.loaderOutcome = null;
});

describe("guardian experiences route", () => {
  it("loads the booking surface for a guardian actor", async () => {
    const loader = (GuardianExperiencesRoute.options as { loader: () => Promise<unknown> }).loader;
    const outcome = await loader() as { ok: boolean; data?: { experiences: typeof guardianData } };
    expect(state.getSchoolExperiences).toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.experiences.viewerRole).toBe("guardian");
    expect(outcome.data?.experiences.slots).toHaveLength(1);
  });

  it("renders an in-page sign-in state instead of throwing for unauthorized actors", async () => {
    state.getSchoolExperiences.mockRejectedValue(new AuthorizationError("role: student or guardian"));
    const loader = (GuardianExperiencesRoute.options as { loader: () => Promise<unknown> }).loader;
    const outcome = await loader() as { ok: boolean; authError?: string | null };
    expect(outcome.ok).toBe(false);
    expect(outcome.authError).toBe("You do not have permission to view this page.");
  });
});

describe("guardian conference access without a single-school profile", () => {
  it("still renders authorized appointments when a guardian belongs to multiple schools", () => {
    state.loaderOutcome = {
      ok: true,
      data: { site: null, siteCount: null, experiences: guardianData },
    };
    const Page = GuardianExperiencesRoute.options.component;
    if (typeof Page !== "function") throw new Error("Missing guardian experiences page");
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("School &amp; teacher conferences");
    expect(html).toContain("Synthetic office hours");
    expect(html).toContain("Cancel appointment");
    expect(html).not.toContain("No school connected");
  });
});

describe("guardian office-hour cancellation", () => {
  it("renders an enabled cancel button for confirmed guardian bookings", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={guardianData} />);
    expect(html).toContain('aria-label="Cancel appointment"');
    expect(html).not.toContain("Coming soon");
    expect(html).not.toMatch(/<button\b(?=[^>]*\saria-label="Cancel appointment")(?=[^>]*\sdisabled(?:=""|(?=\s|>)))[^>]*>/);
    expect(html).toContain("Cancel appointment");
    expect(html).toContain("Synthetic office hours");
    expect(html).toContain("Synthetic Teacher");
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("Recent conference notes");
    expect(html).toContain("We agreed on a reading goal.");
  });
});
