import { useEffect, useMemo, useState } from "react";
import { searchWorkspace, type SearchHit } from "@/modules/search/global-search.functions";
import { getWorkspaceLinks } from "./workspace-navigation.registry";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspaceSession } from "./WorkspaceSession";
import { filterDestinations, openPaletteEvent, type PaletteGroup } from "@/lib/workspace-search";
import { WorkspaceSearchDialog, type SearchDestination } from "./WorkspaceSearchDialog";

const GROUP_ORDER = [
  { key: "courses", label: "Course" },
  { key: "assignments", label: "Assignment" },
  { key: "students", label: "Student" },
  { key: "messages", label: "Message" },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { session } = useWorkspaceSession();
  const activeRole = session?.authenticated ? session.role : null;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchAttempt, setSearchAttempt] = useState(0);

  useEffect(() => {
    function show() {
      setQuery(""); setHits([]); setSearching(false); setSearchFailed(false); setOpen(true);
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) setOpen(false); else show();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(openPaletteEvent, show);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(openPaletteEvent, show);
    };
  }, [open]);

  const destinations = useMemo(() => {
    const authorized = activeRole ? (getWorkspaceLinks(activeRole) ?? []) : [];
    return filterDestinations(query, authorized.map(item => ({ to: item.path, label: item.title }))).slice(0, 6);
  }, [query, activeRole]);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let canceled = false;
    const timer = window.setTimeout(() => {
      searchWorkspace({ data: { query: query.trim() } }).then(result => {
        if (canceled) return;
        setHits(GROUP_ORDER.flatMap(group => result[group.key].map(hit => ({
          ...hit, sub: `${group.label} · ${hit.sub}`,
        }))));
        setSearching(false);
      }).catch(() => {
        if (canceled) return;
        setHits([]); setSearchFailed(true); setSearching(false);
      });
    }, 200);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [query, open, searchAttempt]);

  const groups = useMemo<PaletteGroup<SearchDestination>[]>(() => [
    { label: "Pages", items: destinations.map(link => ({
      id: `nav-${link.to}`, label: link.label, sub: "Go to page", to: link.to,
    })) },
    { label: "Results", items: hits },
  ], [destinations, hits]);

  return <WorkspaceSearchDialog open={open} onClose={() => setOpen(false)} query={query}
    onQueryChange={value => {
      setQuery(value); setHits([]); setSearchFailed(false); setSearching(value.trim().length >= 2);
    }} groups={groups}
    searching={searching} searchFailed={searchFailed} onRetrySearch={() => {
      setSearchFailed(false);
      setSearching(true);
      setSearchAttempt(value => value + 1);
    }} onChoose={entry => {
      setOpen(false);
      void navigate({ href: entry.to });
    }}/>;
}
