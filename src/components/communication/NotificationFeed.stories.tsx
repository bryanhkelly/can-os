import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { NotificationFeed } from "./NotificationFeed";
import type { CenterNotice } from "@/domain/notification-center";

const notices: CenterNotice[] = [
  { id: "course", title: "Course selection is ready", body: "Review next semester's course options.", status: "unread", date: "2026-11-03T16:30:00Z", href: "/guardian/course-approvals" },
  { id: "message", title: "New conversation reply", body: "Your school team has replied.", status: "unread", date: "2026-11-03T15:00:00Z", href: "/messages?thread=fixture" },
  { id: "read", title: "School calendar updated", body: "Your school's calendar has been updated.", status: "read", date: "2026-11-02T12:00:00Z", href: null },
];
function Example({ empty = false, busy = false }: { empty?: boolean; busy?: boolean }) {
  const [items, setItems] = useState(empty ? [] : notices);
  return <div className="mx-auto max-w-3xl p-4">
    <NotificationFeed notices={items} busy={busy}
      onStatus={(id, status) => setItems(current => current.map(item => item.id === id ? { ...item, status } : item))}
      onReadAll={() => setItems(current => current.map(item => item.status === "unread" ? { ...item, status: "read" } : item))} />
  </div>;
}
const meta = { title: "Communication/Notifications", component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ActivityFeed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 unread updates")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Unread" }));
    await expect(canvas.queryByText("School calendar updated")).not.toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Mark as read" })[0]!);
    await expect(canvas.getByText("1 unread update")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Mark all as read" }));
    await expect(canvas.getByText("You're all caught up.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "All updates" }));
    await expect(canvas.getByText("School calendar updated")).toBeVisible();
    await userEvent.click(canvas.getAllByRole("button", { name: "Dismiss" })[0]!);
    await expect(canvas.getByText("Dismissed")).toBeVisible();
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
export const Empty: Story = { args: { empty: true } };
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
    for (const button of canvas.getAllByRole("button", { name: "Mark as read" })) await expect(button).toBeDisabled();
  },
};
