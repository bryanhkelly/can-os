import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  routeOptions: null as Record<string, unknown> | null,
  getSchoolExperiences: vi.fn(),
  bookOfficeHour: vi.fn(),
  rescheduleOfficeHour: vi.fn(),
  cancelOfficeHour: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    state.routeOptions = options;
    return { options, useLoaderData: () => null, useSearch: () => ({}) };
  },
  useSearch: () => ({}),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
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
  slots: [{ id: "slot-1", seriesId: "series-1", startsAt: "2027-11-10T22:00:00.000Z", endsAt: "2027-11-10T22:20:00.000Z", status: "available" }],
  bookings: [{ id: "booking-1", slotId: "slot-2", studentPersonId: "student-1", seriesId: "series-1", startsAt: "2027-11-11T22:00:00.000Z", endsAt: "2027-11-11T22:20:00.000Z" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.getSchoolExperiences.mockResolvedValue(guardianData);
});

describe("guardian experiences route", () => {
  it("loads the booking surface for a guardian actor", async () => {
    const loader = (GuardianExperiencesRoute.options as { loader: () => Promise<unknown> }).loader;
    const outcome = await loader() as { ok: boolean; data?: typeof guardianData };
    expect(state.getSchoolExperiences).toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.viewerRole).toBe("guardian");
    expect(outcome.data?.slots).toHaveLength(1);
  });

  it("renders an in-page sign-in state instead of throwing for unauthorized actors", async () => {
    state.getSchoolExperiences.mockRejectedValue(new AuthorizationError("role: student or guardian"));
    const loader = (GuardianExperiencesRoute.options as { loader: () => Promise<unknown> }).loader;
    const outcome = await loader() as { ok: boolean; authError?: string | null };
    expect(outcome.ok).toBe(false);
    expect(outcome.authError).toBe("You do not have permission to view this page.");
  });
});

describe("guardian office-hour cancellation", () => {
  it("renders an enabled cancel button for confirmed guardian bookings", () => {
    const html = renderToStaticMarkup(<LiveSchoolExperiences data={guardianData} />);
    expect(html).toContain('aria-label="Cancel appointment"');
    expect(html).not.toContain("Coming soon");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*aria-label="Cancel appointment"/);
    expect(html).toContain("Cancel appointment");
  });
});
