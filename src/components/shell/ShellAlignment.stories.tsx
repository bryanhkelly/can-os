import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { DashboardHome, DashboardPanel, DashboardShortcut, WorkspaceShell } from "@/components/workspace";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { getActiveWorkspacePath, workspaceLinks } from "./workspace-navigation.registry";

/**
 * Layout contract gate. The sidebar brand divider, top bar and every page title must
 * share the token grid (--topbar-height, --sidebar-width, --page-gutter) for all pages.
 */
const member = { role: "site_admin", firstName: "Avery", lastName: "Admin", siteId: "east" };
const sites = [{ id: "east", name: "East School" }];
const path = "/operations/launch";

function Shell({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const links = workspaceLinks.site_admin;
  const [collapsed, setCollapsed] = useState(false);
  return <div className="can-shell" data-sidebar={collapsed ? "collapsed" : undefined}>
    <WorkspaceSidebar member={member} links={links} activePath={getActiveWorkspacePath(links, path)}
      expanded={!collapsed} onToggle={() => setCollapsed(value => !value)} />
    <div className="min-w-0">
      <WorkspaceTopBar member={member} sites={sites} authenticated sessionAvailable sessionError={null} error=""
        demoAccountSwitching={false} demoTenant={demo} changing={false} menuOpen={false} switcherOpen={false} accountOpen={false}
        onToggleMenu={fn()} onOpenSwitcher={fn()} onOpenSearch={fn()} onOpenAsk={fn()} onOpenNotifications={fn()} onOpenAccount={fn()} />
      {children}
    </div>
  </div>;
}

const meta = {
  title: "Shell/Layout alignment",
  parameters: { layout: "fullscreen" },
  decorators: [Story => {
    const router = createRouter({
      routeTree: createRootRoute({ component: Story }),
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    return <RouterProvider router={router} />;
  }],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.5);

async function expectShellGrid(canvasElement: HTMLElement, sidebarRem = 15) {
  const canvas = within(canvasElement);
  const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" });
  await expect(sidebar).not.toHaveTextContent("Avery Admin");
  await expect(sidebar).not.toHaveTextContent("East School");
  await expect(sidebar).not.toHaveTextContent("Site admin workspace");
  const brand = sidebar.firstElementChild as HTMLElement;
  const bar = canvas.getByRole("banner", { name: "Workspace top bar" });
  const main = canvas.getByRole("main");
  const title = canvas.getByRole("heading", { level: 1 });
  const switcher = canvas.getByRole("button", { name: /Switch workspace/ });
  const gutter = parseFloat(getComputedStyle(main).paddingLeft);

  near(brand.getBoundingClientRect().bottom, bar.getBoundingClientRect().bottom);
  near(sidebar.getBoundingClientRect().width, parseFloat(getComputedStyle(document.documentElement).fontSize) * sidebarRem);
  near(title.getBoundingClientRect().left, sidebar.getBoundingClientRect().right + gutter);
  near(switcher.getBoundingClientRect().left, title.getBoundingClientRect().left);
  const nav = canvas.getByRole("navigation", { name: "CAN OS primary navigation" });
  await expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  await expect(within(nav).getAllByRole("link")[0]).toHaveTextContent("Home");
}

export const WorkspacePage: Story = {
  render: () => <Shell>
    <WorkspaceShell eyebrow="Operations" title="Host / program launch" subtitle="Configure a school launch.">
      <p className="mt-6 text-sm">Page content</p>
    </WorkspaceShell>
  </Shell>,
  play: async ({ canvasElement }) => {
    await expectShellGrid(canvasElement);
    await expect(within(canvasElement).getByText("Operations")).toHaveClass("can-eyebrow");
  },
};

export const WidePage: Story = {
  render: () => <Shell>
    <WorkspaceShell width="wide" eyebrow="Admissions" title="Admissions pipeline"><p>Wide content</p></WorkspaceShell>
  </Shell>,
  play: async ({ canvasElement }) => expectShellGrid(canvasElement),
};

export const RoleHome: Story = {
  render: () => <Shell>
    <DashboardHome eyebrow="School operations" shortcuts={<>
      <DashboardShortcut title="Action queue" description="Open actions"><a href="#queue" /></DashboardShortcut>
    </>}><DashboardPanel title="Needs you"><p>Queue</p></DashboardPanel></DashboardHome>
  </Shell>,
  play: async ({ canvasElement }) => {
    await expectShellGrid(canvasElement);
    await expect(within(canvasElement).getByRole("heading", { level: 1 })).toHaveTextContent(/^(Welcome|Good (morning|afternoon|evening))/);
  },
};

export const WithDemoNotice: Story = {
  render: () => <Shell demo>
    <WorkspaceShell eyebrow="Operations" title="Needs you"><p>Content</p></WorkspaceShell>
  </Shell>,
  play: async ({ canvasElement }) => {
    await expectShellGrid(canvasElement);
    const bar = within(canvasElement).getByRole("banner", { name: "Workspace top bar" });
    await expect(within(bar).queryByText(/Demo school:/)).not.toBeInTheDocument();
  },
};

export const CollapsibleSidebar: Story = {
  render: () => <Shell>
    <WorkspaceShell eyebrow="Operations" title="Needs you"><p>Content</p></WorkspaceShell>
  </Shell>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" });
    const toggle = canvas.getByRole("button", { name: "Collapse navigation" });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The control sits at the far left of the brand bar, before the wordmark.
    const brand = sidebar.firstElementChild as HTMLElement;
    await expect(brand.firstElementChild).toBe(toggle);
    await expect(toggle.getBoundingClientRect().left - sidebar.getBoundingClientRect().left).toBeLessThanOrEqual(16);
    await userEvent.click(toggle);
    const expand = canvas.getByRole("button", { name: "Expand navigation" });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expectShellGrid(canvasElement, 4.5);
    const nav = canvas.getByRole("navigation", { name: "CAN OS primary navigation" });
    await expect(within(nav).getByRole("link", { name: "Home" })).toBeVisible();
    await userEvent.click(expand);
    await expectShellGrid(canvasElement);
  },
};
