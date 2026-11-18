import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/canonical.lab.facilitated";

const fixtures = vi.hoisted(() => ({
  room: {
    id: "11111111-1111-4111-8111-111111111111",
    state: "live", deploymentId: "deploy-a", courseVersionId: "course-a",
    siteId: "site-a", startedAt: "2026-11-17T19:00:00.000Z",
    expiresAt: "2099-11-17T22:00:00.000Z",
    pairingExpiresAt: "2099-11-17T21:00:00.000Z",
    pairedLearners: 0, latestPlayback: null,
  },
  choice: {
    deploymentId: "deploy-a", courseVersionId: "course-a", siteId: "site-a",
    deploymentName: "Synthetic Delivery", courseTitle: "Synthetic Course",
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config, useLoaderData: () => ({
      ok: true,
      data: {siteId: "site-a", choices: [fixtures.choice], rooms: [fixtures.room]},
    }),
  }),
  useRouter: () => ({invalidate: vi.fn()}),
}));
vi.mock("@/components/workspace", () => ({
  WorkspaceShell: ({children}: {children: ReactNode}) => <main>{children}</main>,
  StatusBadge: ({children}: {children: ReactNode}) => <span>{children}</span>,
  ActionDialog: () => null,
  MutationFeedback: () => null,
}));
vi.mock("@/lib/mutation-feedback", () => ({
  useMutationFeedback: () => ({
    pending: false, refreshFailed: false, error: "", notice: "",
    run: vi.fn(), retryRefresh: vi.fn(),
  }),
}));
vi.mock("@/components/capability-lab/CapabilityLabNav", () => ({
  CapabilityLabNav: () => null,
}));
vi.mock("@/components/learning/ClassroomSchedulePanel", () => ({
  ClassroomSchedulePanel: () => <div>Schedule panel</div>,
}));
vi.mock("@/components/learning/ClassroomFacilitatorConsole", () => ({
  ClassroomFacilitatorConsole: () => <div>Mounted playback controls</div>,
}));
vi.mock("@/components/learning/ClassroomAttendancePanel", () => ({
  ClassroomAttendancePanel: () => <div>Mounted room attendance</div>,
}));
vi.mock("@/components/learning/ClassroomAssistedActivityPanel", () => ({
  ClassroomAssistedActivityPanel: () => <div>Mounted assisted activity</div>,
}));
vi.mock("@/components/learning/ClassroomSurveyManager", () => ({
  ClassroomSurveyManager: () => <div>Mounted room surveys</div>,
}));
vi.mock("@/components/learning/ClassroomConnectQr", () => ({
  ClassroomConnectQr: () => null,
}));
vi.mock("@/components/learning/ClassroomRehearsalPlayer", () => ({
  ClassroomRehearsalPlayer: () => null,
}));
vi.mock("@/components/launch-studio/CanonicalBlueprintLoadError", () => ({
  CanonicalBlueprintLoadError: () => null,
}));
vi.mock("@/modules/learning/classroom-rehearsal.functions", () => ({
  getClassroomRehearsalChoices: vi.fn(),
}));
vi.mock("@/modules/learning/facilitated-learning.functions", () => ({
  getFacilitatedHostWorkspace: vi.fn(),
  startFacilitatedLearningRoom: vi.fn(),
  endFacilitatedLearningRoom: vi.fn(),
  renewFacilitatedLearningPairing: vi.fn(),
}));

describe("facilitator room workspace", () => {
  it("shows room status and a single explicit entry without mounting all live data readers", () => {
    const Page = (Route as unknown as {component: ComponentType}).component;
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Synthetic Course");
    expect(html).toContain("Open room workspace");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Live");
    expect(html).not.toContain("Mounted playback controls");
    expect(html).not.toContain("Mounted room attendance");
    expect(html).not.toContain("Mounted assisted activity");
    expect(html).not.toContain("Mounted room surveys");
  });
});
