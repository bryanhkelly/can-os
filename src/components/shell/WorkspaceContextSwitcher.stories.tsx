import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { WorkspaceSession } from "@/modules/identity/workspace-session.server";
import { WorkspaceContextSwitcher } from "./WorkspaceContextSwitcher";

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

const meta = {
  title: "Shell/Workspace context switcher",
  component: WorkspaceContextSwitcher,
  args: { session, open: true, changing: false, error: "", onClose: fn(), onSwitch: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WorkspaceContextSwitcher>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AuthorizedWorkspaces: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const dialog = await canvas.findByRole("dialog", { name: "Switch workspace" });
    const search = within(dialog).getByRole("searchbox", { name: "Search workspaces" });
    expect(within(dialog).getByRole("button", { name: /teacher\s*Active/ })).toHaveAttribute("aria-current", "true");
    expect(within(dialog).queryByRole("group", { name: "Switcher mode" })).not.toBeInTheDocument();
    await userEvent.type(search, "guardian");
    expect(within(dialog).getByRole("button", { name: /guardian\s*Avery Teacher/ })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /teacher\s*Active/ })).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "unavailable");
    expect(within(dialog).getByText("No workspaces match your search.")).toBeVisible();
    await userEvent.clear(search);
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: /teacher\s*Active/ })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close Switch workspace" }));
    expect(args.onClose).toHaveBeenCalled();
  },
};

export const SwitchError: Story = {
  args: { error: "Unable to change membership. Try again." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const alert = await canvas.findByRole("alert");
    expect(alert).toHaveTextContent("No workspace was changed. Unable to change membership. Try again.");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};
