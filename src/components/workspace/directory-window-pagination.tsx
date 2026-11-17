import { Button } from "@/components/ui/button";

/** For authorized server windows that disclose hasMore, but not a total count.
 * Page indices are zero-based. Never infer an overall result count.
 */
export function DirectoryWindowPagination({ label, pageIndex, hasMore, onPageChange, disabled = false }: {
  label: string;
  pageIndex: number;
  hasMore: boolean;
  onPageChange: (pageIndex: number) => void;
  disabled?: boolean;
}) {
  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center gap-3 text-sm">
    <Button type="button" variant="outline" size="sm"
      disabled={disabled || pageIndex <= 0}
      onClick={() => onPageChange(pageIndex - 1)}>Previous</Button>
    <span aria-live="polite" className="text-muted-foreground">Page {pageIndex + 1}</span>
    <Button type="button" variant="outline" size="sm"
      disabled={disabled || !hasMore}
      onClick={() => onPageChange(pageIndex + 1)}>Next</Button>
  </nav>;
}
