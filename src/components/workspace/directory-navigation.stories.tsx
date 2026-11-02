import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageNavigation } from "./page-navigation";
import { QueryState } from "./query-state";

const meta = { title: "Foundations/Directory search and navigation" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const search = fn(async (query?: string) => [{ id: "fixture", name: query || "Example person" }]);

function DirectoryExample() {
  const [query, setQuery] = useState("");
  const result = useDebouncedDirectorySearch(query, search, "Directory unavailable. Try again.");
  return <>
    <label>Search by name<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <QueryState loading={result.loading && "Loading directory"} error={result.error} onRetry={result.retry}
      isEmpty={result.rows.length === 0} empty={<p>No matching people</p>}>
      <Table aria-label="Example directory"><TableHeader><TableRow><TableHead scope="col">Person</TableHead></TableRow></TableHeader>
        <TableBody>{result.rows.map(row => <TableRow key={row.id}><TableCell>{row.name}</TableCell></TableRow>)}</TableBody>
      </Table>
    </QueryState>
  </>;
}
export const SearchAndRetry: Story = {
  render: () => <DirectoryExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("cell", { name: "Example person" })).toBeVisible());
    search.mockRejectedValueOnce(new Error("Private diagnostics"));
    await userEvent.type(canvas.getByLabelText("Search by name"), "  Jordan  ");
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Directory unavailable. Try again."));
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Private diagnostics")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(canvas.getByRole("cell", { name: "Jordan" })).toBeVisible());
    await expect(search).toHaveBeenLastCalledWith("Jordan");
  },
};
export const LateSearchResponse: Story = {
  render: () => <DirectoryExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("table")).toBeVisible());
    let finish!: (rows: { id: string; name: string }[]) => void;
    search.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await userEvent.type(canvas.getByLabelText("Search by name"), "Older");
    await waitFor(() => expect(search).toHaveBeenLastCalledWith("Older"));
    await userEvent.clear(canvas.getByLabelText("Search by name"));
    await userEvent.type(canvas.getByLabelText("Search by name"), "Current");
    await waitFor(() => expect(canvas.getByRole("cell", { name: "Current" })).toBeVisible());
    finish([{ id: "older", name: "Outdated person" }]);
    await waitFor(() => expect(canvas.queryByRole("status")).not.toBeInTheDocument());
    await expect(canvas.queryByText("Outdated person")).not.toBeInTheDocument();
    await expect(canvas.getByRole("cell", { name: "Current" })).toBeVisible();
  },
};
export const DisabledPageBoundary: Story = {
  render: () => <PageNavigation label="Example pages" showUnavailable
    next={<a href="#next">Next page</a>}><span>Page 1 of 2</span></PageNavigation>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("navigation", { name: "Example pages" })).toBeVisible();
    await expect(canvas.getByText("Previous page")).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Next page" })).toHaveFocus();
  },
};
export const UnknownPageCount: Story = {
  render: () => <PageNavigation label="Example cursor pages" previous={<a href="#previous">Previous records</a>}>
    <span>Records page 2</span>
  </PageNavigation>,
};
