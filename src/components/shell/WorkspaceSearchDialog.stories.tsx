import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { Button } from "@/components/ui/button";
import { WorkspaceSearchDialog } from "./WorkspaceSearchDialog";

const meta = {
  title: "Shell/Workspace search dialog",
  parameters: { chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" } } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ failed = false, pending = false }: { failed?: boolean; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState("");
  const [searchFailed, setSearchFailed] = useState(failed);
  return <div className="bg-background p-6 text-foreground">
    <Button onClick={() => setOpen(true)}>Search workspace</Button>
    <p>Selected: {chosen || "None"}</p>
    <WorkspaceSearchDialog open={open} onClose={() => setOpen(false)} query={query} onQueryChange={setQuery}
      searching={pending} searchFailed={searchFailed} onRetrySearch={() => setSearchFailed(false)} groups={[{ label: "Pages", items: [
        { id: "classes", label: "Classes", sub: "Page", to: "/classes" },
        { id: "students", label: "Students and independently authorized school program rosters", sub: "Page", to: "/staff/students" },
      ].filter(item => item.label.toLowerCase().includes(query.toLowerCase())) }]}
      onChoose={item => { setChosen(item.label); setOpen(false); }}/>
  </div>;
}
export const KeyboardNavigation: Story = {
  render: () => <Example/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Search workspace" });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Search workspace" });
    const input = within(dialog).getByRole("combobox", { name: "Search" });
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute("aria-controls", within(dialog).getByRole("listbox").id);
    await userEvent.tab({ shift: true });
    await expect(within(dialog).getByRole("button", { name: "Close search" })).toHaveFocus();
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const selected = within(dialog).getByRole("option", { selected: true });
    await expect(selected).toHaveTextContent("Students");
    await expect(input).toHaveAttribute("aria-activedescendant", selected.id);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};
export const NoResults: Story = {
  render: () => <Example/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }));
    await userEvent.type(canvas.getByRole("combobox"), "unavailable");
    await expect(canvas.getByRole("status")).toHaveTextContent("No matching pages or records.");
    await expect(canvas.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
  },
};
export const SearchUnavailable: Story = {
  render: () => <Example failed/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Page navigation is still available.");
  },
};
export const Loading: Story = {
  render: () => <Example pending/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search workspace" }));
    await expect(canvas.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
  },
};
export const DarkSearch: Story = {
  globals: { theme: "dark" },
  render: () => <Example/>,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Search workspace" }));
  },
};
