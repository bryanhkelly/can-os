import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { flattenGroups, moveActiveIndex, type PaletteGroup } from "@/lib/workspace-search";

export type SearchDestination = { id: string; label: string; sub: string; to: string };

export function WorkspaceSearchDialog({ open, onClose, query, onQueryChange, groups,
  searching, searchFailed, onRetrySearch, onChoose }: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  groups: readonly PaletteGroup<SearchDestination>[];
  searching: boolean;
  searchFailed: boolean;
  onRetrySearch: () => void;
  onChoose: (destination: SearchDestination) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [previousQuery, setPreviousQuery] = useState(query);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (query !== previousQuery || open !== previousOpen) {
    setPreviousQuery(query);
    setPreviousOpen(open);
    setActive(0);
  }
  const flat = flattenGroups(groups);
  const selected = flat[Math.min(active, Math.max(0, flat.length - 1))];
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, groups]);
  return <Modal open={open} onClose={onClose} label="Search workspace" initialFocus={inputRef}>
    <div className="flex items-center gap-2 border-b p-3">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
      <Input ref={inputRef} role="combobox" aria-label="Search" aria-autocomplete="list"
        aria-expanded={open} aria-controls={`${id}-results`}
        aria-activedescendant={selected ? `${id}-option-${flat.indexOf(selected)}` : undefined}
        autoComplete="off" value={query} placeholder="Search pages and authorized records"
        onChange={event => onQueryChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive(value => moveActiveIndex(value, event.key === "ArrowDown" ? 1 : -1, flat.length));
          } else if (event.key === "Enter" && selected) {
            event.preventDefault();
            onChoose(selected.item);
          }
        }}/>
      <Button variant="ghost" size="sm" onClick={onClose}>Close search</Button>
    </div>
    {searchFailed && <div className="px-4 py-2 text-sm">
      <p role="status" className="text-destructive">Record search is unavailable. Page navigation is still available.</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetrySearch}>Retry record search</Button>
    </div>}
    {searching && <p role="status" className="px-4 py-2 text-sm text-muted-foreground">Searching...</p>}
    {!flat.length && !searching && !searchFailed && <p role="status" className="p-4 text-sm">No matching pages or records.</p>}
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {!!flat.length && !searching && !searchFailed
        ? `${flat.length} ${flat.length === 1 ? "result" : "results"} available.` : ""}
    </p>
    <div id={`${id}-results`} ref={listRef} role="listbox" aria-label="Search results"
      aria-busy={searching} className="max-h-[55dvh] overflow-y-auto p-2">
      {groups.filter(group => group.items.length > 0).map((group, groupIndex) =>
        <div key={group.label} role="group" aria-labelledby={`${id}-group-${groupIndex}`}>
          <p id={`${id}-group-${groupIndex}`} className="px-2 py-2 text-xs font-semibold text-muted-foreground">{group.label}</p>
          {group.items.map(entry => {
            const index = flat.findIndex(row => row.item === entry);
            return <div key={entry.id} id={`${id}-option-${index}`} role="option"
              aria-selected={selected?.item === entry}
              onMouseEnter={() => setActive(index)} onClick={() => onChoose(entry)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm ${
                selected?.item === entry ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
              <span className="min-w-0 break-words font-medium">{entry.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{entry.sub}</span>
            </div>;
          })}
        </div>)}
    </div>
  </Modal>;
}
