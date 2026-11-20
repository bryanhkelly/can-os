import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { WorkspaceLinkNavigation } from "./workspace-link-navigation";
import { DirectoryWindowPagination } from "./directory-window-pagination";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Foundations/V6.1 reporting tables and navigation",
  parameters: {
    chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" } } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const sites = [
  { id: "west", name: "West Community Learning Center", registered: 102, attended: 87, completed: 69 },
  { id: "north", name: "North Valley Community Campus", registered: 58, attended: 45, completed: 34 },
];

function ReportingExample() {
  return <section className="min-w-0 space-y-4 bg-background p-4 text-foreground sm:p-6" aria-label="Example authorized evidence">
    <h2 className="font-serif text-2xl">Participation report</h2>
    <p className="text-sm text-muted-foreground">Isolated fixture records. Not a live report or evidence of approval.</p>
    <div className="border border-border bg-card">
      <Table scrollLabel="Site participation totals" aria-label="Site participation totals" className="min-w-[38rem]">
        <TableCaption className="sr-only">Participation totals by authorized site</TableCaption>
        <TableHeader><TableRow className="bg-muted/40">
          <TableHead scope="col" className="p-3">Site</TableHead>
          <TableHead scope="col" className="p-3">Registered</TableHead>
          <TableHead scope="col" className="p-3">Attended</TableHead>
          <TableHead scope="col" className="p-3">Completed</TableHead>
        </TableRow></TableHeader>
        <TableBody>{sites.map(site => <TableRow key={site.id}>
          <TableRowHead className="p-3">{site.name}</TableRowHead>
          <TableCell className="p-3 tabular-nums">{site.registered}</TableCell>
          <TableCell className="p-3 tabular-nums">{site.attended}</TableCell>
          <TableCell className="p-3 tabular-nums">{site.completed}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <WorkspaceLinkNavigation label="Related evidence destinations" className="gap-3">
      <a href="#summary" className="underline underline-offset-4">Summary</a>
      <a href="#definitions" className="underline underline-offset-4">Definitions</a>
    </WorkspaceLinkNavigation>
    <DirectoryWindowPagination label="Evidence pages" pageIndex={0} hasMore={false}
      onPageChange={() => undefined} previousLabel="Newer" nextLabel="Older" disabled />
    <Button variant="outline" disabled>Unavailable action</Button>
  </section>;
}

const checkSemantics = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const report = canvas.getByRole("table", { name: "Site participation totals" });
  await expect(report).toBeVisible();
  await expect(canvas.getAllByRole("rowheader")).toHaveLength(2);
  await expect(canvas.getAllByRole("columnheader")).toHaveLength(4);
  await expect(canvas.getByRole("region", { name: "Site participation totals" })).toHaveAttribute("tabindex", "0");
  await expect(canvas.getByRole("navigation", { name: "Related evidence destinations" })).toBeVisible();
  await expect(canvas.getByRole("navigation", { name: "Evidence pages" })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Newer" })).toBeDisabled();
  await expect(canvas.getByRole("button", { name: "Older" })).toBeDisabled();
};

export const Desktop: Story = { parameters: { chromatic: { viewports: [1440] } }, render: () => <ReportingExample />, play: async ({ canvasElement }) => checkSemantics(canvasElement) };
export const Tablet: Story = {
  parameters: { chromatic: { viewports: [768] } },
  render: () => <ReportingExample />,
  play: async ({ canvasElement }) => checkSemantics(canvasElement),
};
export const Mobile: Story = {
  parameters: { chromatic: { viewports: [390] } },
  render: () => <div className="max-w-[390px]"><ReportingExample /></div>,
  play: async ({ canvasElement }) => {
    await checkSemantics(canvasElement);
    const region = within(canvasElement).getByRole("region", { name: "Site participation totals" });
    await expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
    region.focus();
    await expect(region).toHaveFocus();
  },
};
export const Dark: Story = {
  globals: { theme: "dark" },
  parameters: { chromatic: { viewports: [390, 1440] } },
  render: () => <ReportingExample />,
  play: async ({ canvasElement }) => checkSemantics(canvasElement),
};

function CursorPageExample() {
  const [page, setPage] = React.useState(0);
  return <div className="bg-background p-6 text-foreground">
    <DirectoryWindowPagination label="Blueprint review history" pageIndex={page} hasMore={page < 2}
      previousLabel="Newer" nextLabel="Older" onPageChange={setPage}/>
  </div>;
}

export const CursorPagingInteractions: Story = {
  render: () => <CursorPageExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Newer" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Older" }));
    await expect(canvas.getByText("Page 2")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Older" }));
    await expect(canvas.getByText("Page 3")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Older" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Newer" }));
    await expect(canvas.getByText("Page 2")).toBeVisible();
  },
};
