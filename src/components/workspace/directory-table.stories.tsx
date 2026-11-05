import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List } from "lucide-react";
import { DirectoryPage, DirectoryTable, type DirectorySort } from "./directory-table";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { EmptyState } from "./empty-state";
import { CreateAction } from "./create-action";
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

function PageExample() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("table");
  const [filter, setFilter] = useState("all");
  const rows = fixtures.filter(row => row.name.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || row.students >= 20));
  const empty = <EmptyState kind="matches" actions={<Button variant="outline" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</Button>}/>;
  return <DirectoryPage title="Teacher directory" query={query} onQueryChange={setQuery}
    actions={<CreateAction><a href="#invite">Invite teacher</a></CreateAction>}
    filters={<Field label="Roster size"><Select value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="all">All rosters</option><option value="large">20 or more students</option>
    </Select></Field>}
    view={view} onViewChange={setView} views={[{ value: "table", label: "Table view", icon: <List/> }, { value: "grid", label: "Grid view", icon: <LayoutGrid/> }]}>
    {view === "table" ? <DirectoryTable label="Teachers" caption="Isolated example records." rows={rows} rowKey={row => row.id} empty={empty}
      columns={[{ id: "name", title: "Teacher", render: row => row.name }, { id: "students", title: "Students", render: row => row.students }]}/>
      : rows.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{rows.map(row => <article key={row.id} className="min-w-0 border p-4"><h2>{row.name}</h2><p>{row.students} students</p></article>)}</div> : empty}
  </DirectoryPage>;
}
export const DirectoryComposition: Story = { render: () => <PageExample/> };
export const NoRecords: Story = { render: () => <EmptyState kind="records" actions={<Button variant="outline">Create first record</Button>}/> };
export const NoMatches: Story = { render: () => <EmptyState kind="matches" actions={<Button variant="outline">Clear filters</Button>}/> };
