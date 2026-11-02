import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { DirectoryTable, type DirectorySort } from "./directory-table";
import { PageNavigation } from "./page-navigation";

const meta = {
  title: "Foundations/Directory table",
  parameters: { chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" } } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const fixtures = [
  { id: "a", name: "Alexandra Morgan — North Valley Community School", students: 12 },
  { id: "b", name: "Jordan Lee", students: 24 },
  { id: "c", name: "Morgan Avery", students: 18 },
];
function Example({ loading = false, error = "", empty = false }: { loading?: boolean; error?: string; empty?: boolean }) {
  const [sort, setSort] = useState<DirectorySort>({ column: "name", direction: "ascending" });
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState(Boolean(error));
  const rows = [...fixtures].sort((a, b) => {
    const result = sort.column === "name" ? a.name.localeCompare(b.name) : a.students - b.students;
    return sort.direction === "ascending" ? result : -result;
  }).slice(page * 2, page * 2 + 2);
  return <div className="min-w-0 bg-background p-6 text-foreground">
    <DirectoryTable label="Teacher directory" caption="Isolated example records. Use the scroll area on narrow screens."
      rows={empty ? [] : rows} rowKey={row => row.id} sort={sort} onSort={next => { setSort(next); setPage(0); }}
      loading={loading && "Loading directory..."} error={failed ? error : undefined} onRetry={() => setFailed(false)}
      columns={[
        { id: "name", title: "Teacher", sortable: true, render: row => row.name },
        { id: "students", title: "Students", sortable: true, render: row => row.students },
      ]}
      pagination={<PageNavigation label="Directory pages" showUnavailable
        previous={page > 0 && <Button variant="outline" onClick={() => setPage(page - 1)}>Previous page</Button>}
        next={page < 1 && <Button variant="outline" onClick={() => setPage(page + 1)}>Next page</Button>}>
        <span>Page {page + 1} of 2</span>
      </PageNavigation>}/>
  </div>;
}
export const SortingAndPaging: Story = {
  render: () => <Example/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Students" }));
    await expect(canvas.getByRole("columnheader", { name: "Students" })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(canvas.getByRole("button", { name: "Students" }));
    await expect(canvas.getByRole("columnheader", { name: "Students" })).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(canvas.getByText("Page 2 of 2")).toBeVisible();
    await expect(canvas.getByText("Next page")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }));
    await expect(canvas.getByText("Page 1 of 2")).toBeVisible();
  },
};
export const Loading: Story = { render: () => <Example loading/> };
export const Empty: Story = { render: () => <Example empty/> };
export const ErrorWithRetry: Story = {
  render: () => <Example error="Directory unavailable. Retry loading authorized records."/>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.getByRole("table")).toBeVisible();
  },
};
export const DarkDirectory: Story = { globals: { theme: "dark" }, render: () => <Example/> };
