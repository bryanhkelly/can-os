import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

const meta = {
  title: "Shell/Workspace top bar",
  component: WorkspaceTopBar,
  args: {
    member: { role: "teacher", firstName: "Avery", lastName: "Teacher", siteId: "east" },
    sites: [{ id: "west", name: "West School" }, { id: "east", name: "East School" }],
    authenticated: true, sessionAvailable: true, sessionError: null, error: "",
    demoAccountSwitching: false, changing: false, menuOpen: false, switcherOpen: false, accountOpen: false,
    onToggleMenu: fn(), onOpenSwitcher: fn(), onOpenSearch: fn(), onOpenAsk: fn(),
    onOpenNotifications: fn(), onOpenAccount: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WorkspaceTopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSchool: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Switch workspace/ }))
      .toHaveAccessibleName(/Switch workspace: CAN OS teacher East School/i);
    await expect(canvas.queryByText("2 schools")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }));
    await expect(args.onOpenSearch).toHaveBeenCalledTimes(1);
    await expect(args.onOpenAsk).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Ask CAN" }));
    await expect(args.onOpenAsk).toHaveBeenCalledTimes(1);
  },
};

export const OrganizationScope: Story = {
  args: { member: { role: "registrar", firstName: "Avery", lastName: "Registrar", siteId: null } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: /Switch workspace/ }))
      .toHaveAccessibleName(/Switch workspace: CAN OS registrar All authorized schools \(2\)/i);
  },
};
