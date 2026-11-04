import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
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
  decorators: [Story => {
    const root = createRootRoute({ component: Story });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    return <RouterProvider router={router} />;
  }],
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

export const DismissDemoInformation: Story = {
  args: { demoAccountSwitching: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const close = canvas.getByRole("button", { name: "Dismiss demo information" });
    await close.focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.queryByText(/Demo admin session:/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Switch workspace/ })).toHaveFocus();
    await expect(args.onOpenSwitcher).not.toHaveBeenCalled();
  },
};

export const DismissDemoSchoolInformation: Story = {
  args: { demoTenant: true, sessionError: "Session refresh unavailable" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss demo information" }));
    await expect(canvas.queryByText(/Demo school:/)).not.toBeInTheDocument();
    await expect(canvas.getByRole("alert")).toHaveTextContent("Session refresh unavailable");
  },
};

export const DemoWorkspaceChange: Story = {
  render: args => {
    const [member, setMember] = useState(args.member);
    return <>
      <WorkspaceTopBar {...args} member={member} demoAccountSwitching />
      <button type="button" onClick={() => setMember({
        role: "student", firstName: "Jordan", lastName: "Student", siteId: "west",
      })}>Change demo workspace</button>
    </>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss demo information" }));
    await expect(canvas.queryByText(/Demo admin session:/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Change demo workspace" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("acting as Jordan Student (student)");
    await expect(canvas.getByRole("button", { name: "Dismiss demo information" })).toBeVisible();
  },
};
