import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Domain-neutral directory/filter controls. Feature owners supply filters,
 * state and callbacks; this component never filters or fetches records.
 */
export function FilterBar({
  query, onQueryChange, searchLabel = "Search", searchPlaceholder, filters,
  views, view, onViewChange, label = "Directory", className = "",
}: {
  query: string;
  onQueryChange: (query: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  views?: readonly { value: string; label: string; icon: ReactNode }[];
  view?: string;
  onViewChange?: (view: string) => void;
  label?: string;
  className?: string;
}) {
  return <div role="search" aria-label={`${label} search`}
    className={`mt-6 flex min-w-0 flex-wrap items-end gap-4 ${className}`}>
    <Field label={searchLabel} className="min-w-0 flex-1 sm:max-w-sm">
      <Input type="search" value={query} onChange={event => onQueryChange(event.target.value)}
        placeholder={searchPlaceholder}/>
    </Field>
    {filters}
    {views && onViewChange && <div role="group" aria-label="Directory view" className="flex shrink-0 gap-1">
      {views.map(option => <Button key={option.value} type="button" size="icon"
        variant={view === option.value ? "secondary" : "ghost"}
        aria-pressed={view === option.value} aria-label={option.label} title={option.label}
        onClick={() => onViewChange(option.value)}>{option.icon}</Button>)}
    </div>}
  </div>;
}
