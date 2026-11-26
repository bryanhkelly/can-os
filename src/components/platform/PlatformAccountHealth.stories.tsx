import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PlatformAccountHealth } from "./PlatformAccountHealth";
import type { AccountHealth, AccountHealthRow } from "@/modules/identity/account-health.server";

const row: AccountHealthRow = {
  kind: "real", accounts: 12, disabled: 1, activeGrants: 15,
  missingActivePerson: 0, personMismatches: 0, scopeMismatches: 0,
  noActiveGrants: 1, unverifiedActiveReal: 0, invalidDemoScopes: 0,
};
const health: AccountHealth = {
  status: "available", checkedAt: "2026-11-25T12:00:00Z",
  rows: [row, { ...row, kind: "demo", accounts: 4, activeGrants: 5, scopeMismatches: 1 }],
};
const meta = {
  title: "Platform/Account health",
  component: PlatformAccountHealth,
  args: { health },
  parameters: { chromatic: { modes: {
    light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" },
  } } },
} satisfies Meta<typeof PlatformAccountHealth>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inventory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table", { name: "Account integrity inventory" })).toBeVisible();
    await expect(canvas.getByText("Demo", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Real", { exact: true })).toBeVisible();
  },
};
export const EmptyInventory: Story = {
  args: { health: { ...health, rows: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No accounts in the inventory.")).toBeVisible();
  },
};
export const Unavailable: Story = {
  args: { health: { ...health, status: "unavailable", rows: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Account integrity could not be checked");
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
  },
};
