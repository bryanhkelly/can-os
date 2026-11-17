import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState } from "./query-state";
import { FilterBar } from "./filter-bar";
import { WorkspaceShell, type WorkspaceShellProps } from "./workspace-shell";

export function DirectoryPage({ query, onQueryChange, searchLabel = "Search", searchPlaceholder, filters, views, view, onViewChange, children, ...shell }: Omit<WorkspaceShellProps, "children"> & {
  query: string;
  onQueryChange: (query: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  views?: readonly { value: string; label: string; icon: ReactNode }[];
  view?: string;
  onViewChange?: (view: string) => void;
  children: ReactNode;
}) {
  return <WorkspaceShell {...shell}>
    <FilterBar label={typeof shell.title === "string" ? shell.title : "Directory"}
      query={query} onQueryChange={onQueryChange} searchLabel={searchLabel}
      searchPlaceholder={searchPlaceholder} filters={filters} views={views}
      view={view} onViewChange={onViewChange}/>
    {children}
  </WorkspaceShell>;
}

export type DirectoryColumn<T> = {
  id: string;
  title: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
};
export type DirectorySort = { column: string; direction: "ascending" | "descending" };

export function DirectoryTable<T>({ label, caption, rows, columns, rowKey, sort, onSort,
  loading, error, onRetry, empty, pagination }: {
  label: string;
  caption: string;
  rows: readonly T[];
  columns: readonly DirectoryColumn<T>[];
  rowKey: (row: T) => string;
  sort?: DirectorySort;
  onSort?: (sort: DirectorySort) => void;
  loading?: string | false;
  error?: string;
  onRetry?: () => void;
  empty?: ReactNode;
  pagination?: ReactNode;
}) {
  return <QueryState loading={loading} error={error} onRetry={onRetry} isEmpty={rows.length === 0} empty={empty}>
    <div className="mt-6 min-w-0 border bg-card">
      <Table aria-label={label} scrollLabel={`${label} scroll area`}>
        <TableCaption className="px-4 pb-4 text-left">{caption}</TableCaption>
        <TableHeader><TableRow>{columns.map(column => {
          const sortable = column.sortable && onSort;
          const direction = sort?.column === column.id ? sort.direction : undefined;
          const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
          return <TableHead key={column.id} scope="col" aria-sort={sortable ? direction ?? "none" : undefined}
            className="px-4 py-3">
            {sortable ? <Button variant="ghost" size="sm" onClick={() => onSort({
              column: column.id, direction: direction === "ascending" ? "descending" : "ascending",
            })}>{column.title}<Icon aria-hidden="true"/></Button> : column.title}
          </TableHead>;
        })}</TableRow></TableHeader>
        <TableBody>{rows.map(row => <TableRow key={rowKey(row)}>
          {columns.map(column => <TableCell key={column.id} className="px-4 py-3 align-top">{column.render(row)}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
      {pagination && <div className="border-t p-4">{pagination}</div>}
    </div>
  </QueryState>;
}
