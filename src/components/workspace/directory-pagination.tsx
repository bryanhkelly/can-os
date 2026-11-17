import { Button } from "@/components/ui/button";

/**
 * Controlled pagination for directories. Callers own the query, page boundaries,
 * and authorized results. This component never slices or fetches records.
 */
export function DirectoryPagination({ label, page, pageSize, totalItems, onPageChange, disabled = false }: {
  label: string;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const first = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, totalItems);
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
    <p aria-live="polite" className="text-muted-foreground">
      {totalItems === 0 ? "No results" : `Showing ${first}–${last} of ${totalItems}`}
      <span className="sr-only">, page {currentPage} of {totalPages}</span>
    </p>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled || currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}>Previous</Button>
      <span aria-current="page" className="min-w-14 text-center tabular-nums">{currentPage} / {totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={disabled || currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}>Next</Button>
    </div>
  </nav>;
}
