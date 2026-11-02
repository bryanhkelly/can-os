import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceContextSwitcher, workspaceGrantSearchText } from "@/components/shell/WorkspaceContextSwitcher";
import type { WorkspaceSession } from "@/modules/identity/workspace-session.server";

type AuthenticatedSession = Extract<WorkspaceSession, { authenticated: true }>;
const session: AuthenticatedSession = {
  authenticated: true,
  activeGrantId: "teacher-grant",
  role: "teacher",
  grants: [
    { id: "teacher-grant", personId: "person", role: "teacher", firstName: "Avery", lastName: "Teacher", organizationId: "org", siteId: "school" },
    { id: "guardian-grant", personId: "person", role: "guardian", firstName: "Avery", lastName: "Teacher", organizationId: "org", siteId: "school" },
  ],
  sites: [{ id: "school", name: "Example School", organizationId: "org" }],
  programs: [],
  activeContext: { organizationIds: ["org"], siteIds: ["school"], programIds: [] },
};

describe("workspace context switcher", () => {
  it("uses one labelled authorized-membership list without a redundant mode selector", () => {
    const html = renderToStaticMarkup(<WorkspaceContextSwitcher session={session} open changing={false}
      error="" onClose={vi.fn()} onSwitch={vi.fn()} />);
    expect(html).toContain('aria-label="Switch workspace"');
    expect(html).toContain("Search workspaces");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Example School");
    expect(html).not.toContain("Switcher mode");
    expect(html).not.toContain("View As");
    expect(html.match(/<dialog/g)).toHaveLength(1);
  });

  it("keeps switching errors explicit, programmatically focusable, and inside the dialog", () => {
    const html = renderToStaticMarkup(<WorkspaceContextSwitcher session={session} open changing={false}
      error="Unable to change membership." onClose={vi.fn()} onSwitch={vi.fn()} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("No workspace was changed. Unable to change membership.");
  });

  it("searches role names and only the grant's authorized school", () => {
    const grant = session.grants[0]!;
    expect(workspaceGrantSearchText(grant, session.sites)).toContain("teacher");
    expect(workspaceGrantSearchText(grant, session.sites)).toContain("example school");
    expect(workspaceGrantSearchText(grant, [])).not.toContain("example school");
  });
});
