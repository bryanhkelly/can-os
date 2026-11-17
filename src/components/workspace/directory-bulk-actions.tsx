import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type DirectoryBulkAction = {
  id: string;
  label: string;
  onClick: (selectedKeys: ReadonlySet<string>) => void;
  disabled?: boolean;
  destructive?: boolean;
};

/** Only renders permitted actions supplied by the owning feature.
 * Server commands must independently authorize every selected record.
 */
export function DirectoryBulkActions({ label, selectedKeys, actions, onClear, pending = false, children }: {
  label: string;
  selectedKeys: ReadonlySet<string>;
  actions: readonly DirectoryBulkAction[];
  onClear: () => void;
  pending?: boolean;
  children?: ReactNode;
}) {
  if (!selectedKeys.size) return null;
  return <section aria-label={`${label} bulk actions`} className="flex flex-wrap items-center gap-3 border border-border bg-muted/30 p-3">
    <p role="status" aria-live="polite" className="mr-auto text-sm font-medium">
      {selectedKeys.size} {selectedKeys.size === 1 ? "record" : "records"} selected
    </p>
    {children}
    {actions.map(action => <Button key={action.id} type="button" size="sm"
      variant={action.destructive ? "destructive" : "outline"}
      disabled={pending || action.disabled} onClick={() => action.onClick(selectedKeys)}>
      {action.label}
    </Button>)}
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClear}>Clear selection</Button>
  </section>;
}
