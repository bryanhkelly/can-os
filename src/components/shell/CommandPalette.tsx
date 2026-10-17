import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { searchWorkspace, type SearchHit } from "@/modules/search/global-search.functions";
import { workspaceLinks } from "@/components/shell/WorkspaceNavigation";
import {
  filterDestinations,
  flattenGroups,
  moveActiveIndex,
  openPaletteEvent,
  type PaletteGroup,
} from "@/lib/workspace-search";

type PaletteEntry = { id: string; label: string; sub: string; to: string };

const GROUP_ORDER: Array<{ key: "courses" | "assignments" | "students" | "messages"; label: string }> = [
  { key: "courses", label: "Courses" },
  { key: "assignments", label: "Assignments" },
  { key: "students", label: "Students" },
  { key: "messages", label: "Messages" },
];

/**
 * Prototype-grade ⌘K/Ctrl+K palette: navigation destinations plus an
 * authorized server search over courses, assignments, students, and messages.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(openPaletteEvent, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(openPaletteEvent, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    setSearchFailed(false);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/access/session", {credentials:"same-origin",cache:"no-store"})
      .then(async response => response.ok ? response.json() : null)
      .then(session => {
        if (!active) return;
        const grant = (session?.grants ?? []).find((g:{id:string})=>g.id===session.activeGrantId);
        setActiveRole(grant?.role ?? null);
      }).catch(() => {if(active)setActiveRole(null)});
    return ()=>{active=false};
  }, [open]);

  const destinations = useMemo(() => {
    const authorized = activeRole ? (workspaceLinks[activeRole] ?? []) : [];
    return filterDestinations(query, authorized.map(item=>({to:item.path,label:item.title}))).slice(0, 6);
  }, [query, activeRole]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let canceled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchWorkspace({ data: { query: term } })
        .then((result) => {
          if (canceled) return;
          setHits(
            GROUP_ORDER.flatMap((group) =>
              result[group.key].map((hit) => ({ ...hit, sub: `${group.label.slice(0, -1)} · ${hit.sub}` })),
            ),
          );
          setSearchFailed(false);
          setSearching(false);
        })
        .catch(() => {
          if (canceled) return;
          setHits([]);
          setSearchFailed(true);
          setSearching(false);
        });
    }, 200);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const groups = useMemo<PaletteGroup<PaletteEntry>[]>(() => {
    const nav: PaletteEntry[] = destinations.map((link) => ({
      id: `nav-${link.to}`,
      label: link.label,
      sub: "Go to page",
      to: link.to,
    }));
    return [
      { label: "Pages", items: nav },
      ...(hits.length ? [{ label: "Results", items: hits as PaletteEntry[] }] : []),
    ];
  }, [destinations, hits]);

  const flat = useMemo(() => flattenGroups(groups), [groups]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (index: number) => {
    const entry = flat[index];
    if (!entry) return;
    setOpen(false);
    void navigate({ to: entry.item.to });
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => moveActiveIndex(value, 1, flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => moveActiveIndex(value, -1, flat.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[18vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        className="w-full max-w-xl rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages, courses, assignments, students, messages…"
            aria-label="Search"
            aria-activedescendant={flat[active] ? `palette-option-${flat[active].item.id}` : undefined}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div ref={listRef} role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto p-2">
          {searchFailed && (
            <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
              Search is unavailable. Sign in to search workspace records.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {group.items.length === 0 && group.label === "Pages" ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No matching pages.</p>
              ) : null}
              {group.items.map((entry) => {
                const index = flat.findIndex((f) => f.item.id === entry.id);
                return (
                  <button
                    key={entry.id}
                    id={`palette-option-${entry.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                      index === active ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <span className="truncate font-medium">{entry.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{entry.sub}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {searching && (
            <p role="status" className="px-2 py-2 text-xs text-muted-foreground">Searching…</p>
          )}
        </div>
      </div>
    </div>
  );
}
