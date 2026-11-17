import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, Square } from "lucide-react";
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
export type DirectoryRowAction<T> = {
  id: string;
  label: string;
  allowed: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  onClick: (row: T) => void;
};

export function DirectoryTable<T>({ label, caption, rows, columns, rowKey, sort, onSort,
  loading, error, onRetry, empty, pagination, selectedKeys, onSelectionChange, rowActions }: {
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
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (keys: ReadonlySet<string>) => void;
  rowActions?: readonly DirectoryRowAction<T>[];
}) {
  const selectable = !!selectedKeys && !!onSelectionChange;
  const keysOnPage = rows.map(rowKey);
  const allSelected = keysOnPage.length > 0 && keysOnPage.every(key => selectedKeys?.has(key));
  function toggle(keys: readonly string[], selected: boolean) {
    if (!selectedKeys || !onSelectionChange) return;
    const next = new Set(selectedKeys);
    for (const key of keys) {
      if (selected) next.add(key);
      else next.delete(key);
    }
    onSelectionChange(next);
  }
  return <QueryState loading={loading} error={error} onRetry={onRetry} isEmpty={rows.length === 0} empty={empty}>
    <div className="mt-6 min-w-0 border bg-card">
      <Table aria-label={label} scrollLabel={`${label} scroll area`}>
        <TableCaption className="px-4 pb-4 text-left">{caption}</TableCaption>
        <TableHeader><TableRow>
          {selectable && <TableHead scope="col" className="w-12 px-4">
            <Button type="button" variant="ghost" size="sm"
              aria-label={allSelected ? "Deselect page" : "Select page"}
              aria-pressed={allSelected} onClick={() => toggle(keysOnPage, !allSelected)}>
              {allSelected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
            </Button>
          </TableHead>}
          {columns.map(column => {
          const sortable = column.sortable && onSort;
          const direction = sort?.column === column.id ? sort.direction : undefined;
          const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
          return <TableHead key={column.id} scope="col" aria-sort={sortable ? direction ?? "none" : undefined}
            className="px-4 py-3">
            {sortable ? <Button variant="ghost" size="sm" onClick={() => onSort({
              column: column.id, direction: direction === "ascending" ? "descending" : "ascending",
            })}>{column.title}<Icon aria-hidden="true"/></Button> : column.title}
          </TableHead>;
        })}
          {!!rowActions?.length && <TableHead scope="col" className="px-4">Actions</TableHead>}
        </TableRow></TableHeader>
        <TableBody>{rows.map(row => {
          const key = rowKey(row);
          const selected = selectedKeys?.has(key) ?? false;
          return <TableRow key={key} data-state={selected ? "selected" : undefined}>
            {selectable && <TableCell className="px-4">
              <Button type="button" variant="ghost" size="sm"
                aria-label={`${selected ? "Deselect" : "Select"} row ${key}`}
                aria-pressed={selected} onClick={() => toggle([key], !selected)}>
                {selected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
              </Button>
            </TableCell>}
            {columns.map(column => <TableCell key={column.id} className="px-4 py-3 align-top">{column.render(row)}</TableCell>)}
            {!!rowActions?.length && <TableCell className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {rowActions.filter(action => action.allowed(row)).map(action =>
                  <Button key={action.id} type="button" variant="ghost" size="sm"
                    disabled={action.disabled?.(row) ?? false} onClick={() => action.onClick(row)}>
                    {action.label}
                  </Button>)}
              </div>
            </TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table>
      {pagination && <div className="border-t p-4">{pagination}</div>}
    </div>
  </QueryState>;
}
