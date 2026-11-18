import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacilitatedClassroomEntry } from "@/components/operations/FacilitatedClassroomEntry";

const state = vi.hoisted(() => ({
  kind: "error" as "error" | "pending" | "success",
  roomSiteId: "site-a",
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isPending: state.kind === "pending",
    isError: state.kind === "error",
    isSuccess: state.kind === "success",
    isFetching: false,
    refetch: vi.fn(),
    data: {
      siteId: state.roomSiteId,
      choices: [{ siteId: state.roomSiteId }],
      rooms: [{ siteId: state.roomSiteId, state: "live" }],
    },
  }),
}));
vi.mock("@/components/workspace", () => ({
  WorkspacePanel: ({ title, description, children }: {
    title: string; description?: string; children: ReactNode;
  }) => <section aria-label={title}><p>{description}</p>{children}</section>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/modules/learning/facilitated-learning.functions", () => ({
  getFacilitatedHostWorkspace: vi.fn(),
}));
beforeEach(() => { state.kind = "error"; state.roomSiteId = "site-a"; });

describe("facilitator classroom entry", () => {
  it("never offers a classroom action when current authorization fails", () => {
    const html = renderToStaticMarkup(<FacilitatedClassroomEntry siteId="site-a" />);
    expect(html).toContain("could not be verified");
    expect(html).toContain("Recheck classroom access");
    expect(html).not.toContain("Open facilitated classrooms");
  });
  it("does not link across Site memberships", () => {
    state.kind = "success";
    const html = renderToStaticMarkup(<FacilitatedClassroomEntry siteId="site-b" />);
    expect(html).toContain("does not match");
    expect(html).not.toContain("Open facilitated classrooms");
  });
  it("offers the existing room workspace only after exact-Site authorization", () => {
    state.kind = "success";
    const html = renderToStaticMarkup(<FacilitatedClassroomEntry siteId="site-a" />);
    expect(html).toContain("Open facilitated classrooms");
    expect(html).toContain("1</strong> live rooms");
    expect(html).toContain("1</strong> available course choices");
  });
  it("does not show an actionable link while checking authority", () => {
    state.kind = "pending";
    const html = renderToStaticMarkup(<FacilitatedClassroomEntry siteId="site-a" />);
    expect(html).toContain("Verifying current classroom permissions");
    expect(html).not.toContain("Open facilitated classrooms");
  });
});
