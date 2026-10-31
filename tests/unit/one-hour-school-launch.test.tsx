import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OneHourSchoolLaunch } from "@/components/operations/OneHourSchoolLaunch";
import type { listLaunches } from "@/modules/programs/launch.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn() }),
}));
vi.mock("@/modules/programs/launch.functions", () => ({
  activateLaunch: vi.fn(),
  completeLaunchRequirement: vi.fn(),
  scheduleLaunchOrientation: vi.fn(),
}));

vi.mock("@/components/workspace", () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];
const base: Launch = {
  id: "program",
  name: "Grace Academy",
  slug: "grace-academy",
  type: "full_school",
  status: "launching",
  organizationId: "organization",
  siteId: "site",
  siteTimezone: "America/New_York",
  publicSiteSlug: "grace",
  publicSiteStatus: "draft",
  createdAt: "2026-10-28T12:00:00.000Z",
  publicSite: { host: "grace.example.test", status: "draft" },
  journey: { id: "journey", status: "in_progress" },
  requirements: [
    { id: "staff", key: "teacher-readiness", title: "Verify teachers", status: "needs_can", blocking: true },
    { id: "orientation", key: "orientation", title: "Schedule orientation", status: "needs_you", blocking: false },
  ],
  openingOperators: [{ personId: "operator", firstName: "Alex", lastName: "Operator" }],
};

function launch(overrides: Partial<Launch> = {}): Launch {
  return { ...base, ...overrides };
}
function render(value: Launch, selectedProgramId?: string) {
  return renderToStaticMarkup(<OneHourSchoolLaunch launches={[value]} selectedProgramId={selectedProgramId} />);
}

describe("guided school launch", () => {
  it("shows one canonical next task with ownership and progressive disclosure", () => {
    const html = render(launch());
    expect(html).toContain("Next up");
    expect(html).toContain("Verify teachers");
    expect(html).toContain("Needs CAN");
    expect(html).toContain("cannot mark it complete");
    expect(html).not.toContain("Save school completion");
    expect(html).toContain("View the full saved launch path");
    expect(html).toContain("Prepare your school community");
    expect(html).toContain("Review private school website");
    expect(html).toContain("while opening reviews continue");
    expect(html).toContain("Continue school preparation");
    expect(html).toContain("Prepare first classroom");
    expect(html).not.toContain("Assigned owner ID");
    expect(html).not.toContain("Saved requirement:");
    expect(html).not.toContain(">Activate</button>");
    expect(html.match(/aria-label="Next launch task"/g)).toHaveLength(1);
  });

  it("keeps independent CAN approval separate from preparation", () => {
    const html = render(launch());
    expect(html).toContain("Opening authority");
    expect(html).toContain("independent server checks");
    expect(html).toContain("do not activate enrollment or authorize a supervised school day");
  });

  it("resumes from refreshed state instead of preserving a browser-completed checklist", () => {
    const initial = render(launch());
    const refreshed = render(launch({
      journey: { id: "journey", status: "ready" },
      requirements: base.requirements.map(requirement => requirement.blocking
        ? { ...requirement, status: "complete" }
        : requirement),
    }));
    expect(initial).not.toContain(">Activate</button>");
    expect(refreshed).toContain("Review and open the program");
    expect(refreshed).toContain("Receiving site operator (required)");
    expect(refreshed).toContain("Activation is not self-certified");
    expect(refreshed).toContain("Prepare your school community");
  });

  it("resumes the launch selected in the URL across sessions and devices", () => {
    const other = launch({ id: "other", name: "Other School" });
    const html = renderToStaticMarkup(<OneHourSchoolLaunch
      launches={[base, other]} selectedProgramId="other" />);
    expect(html).toContain("Continue Other School");
    expect(html).toContain("Resume a school launch");
    expect(html).toContain("another session or device");
    expect(html).toContain("no browser checklist determines readiness");
  });

  it("requires an explicit confirmation for school-owned completion only", () => {
    const html = render(launch({
      requirements: [{ id: "facility", key: "facility", title: "Review facility", status: "needs_you", blocking: true }],
    }));
    expect(html).toContain("Record this school-owned requirement");
    expect(html).toContain("I confirm the school-owned work is complete");
    expect(html).toContain("cannot complete CAN or third-party work");
    expect(html).toMatch(/disabled=""[^>]*>\s*Save school completion/);
  });

  it("uses a form proposal and the canonical command for recommended orientation scheduling", () => {
    const html = render(launch({
      requirements: [{ id: "orientation", key: "orientation", title: "Schedule orientation", status: "needs_you", blocking: true }],
    }));
    expect(html).toContain("Use a suggested 45-minute time");
    expect(html).toContain("suggestion only fills this form");
    expect(html).toContain("existing orientation command");
    expect(html).toContain("America/New_York");
  });

  it("never presents activation merely because all visible tasks are checked", () => {
    const html = render(launch({
      journey: { id: "journey", status: "in_progress" },
      requirements: [{ id: "school", key: "school-readiness", title: "School review", status: "complete", blocking: true }],
    }));
    expect(html).not.toContain(">Activate</button>");
    expect(html).toContain("Opening stays locked");
    expect(html).toContain("Review launch record");
  });

  it("offers Site Today as the daily destination for an active site program", () => {
    const html = render(launch({ status: "active" }));
    expect(html).toContain("Daily work now lives");
    expect(html).toContain("Open Site Today");
  });
});

