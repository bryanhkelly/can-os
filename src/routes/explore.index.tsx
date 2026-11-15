import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace";
import { getMyCanDiscoverablePrograms } from "@/modules/identity/my-can-discovery.functions";

/** Program-first and location-first discovery meet at the same verified Site. */
export const Route = createFileRoute("/explore/")({ component: ExplorePage });

type Category = "all" | "school" | "community";
function ExplorePage() {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const query = useQuery({
    queryKey: ["my-can-discovery"],
    queryFn: () => getMyCanDiscoverablePrograms(),
    retry: false,
    staleTime: 30_000,
  });
  const term = text.trim().toLowerCase();
  const matches = query.data?.locations.flatMap(site =>
    site.programs
      .filter(program => category === "all" || program.category === category)
      .filter(program => !term || [
        program.title, program.description, site.siteName, site.organizationName,
        site.city, site.region,
      ].some(value => value?.toLowerCase().includes(term)))
      .map(program => ({ ...program, site }))
  ) ?? [];

  return <WorkspaceShell eyebrow="Discovery" title="Explore programs and places"
    width="wide" subtitle="Find published opportunities across schools and community learning centers. Your account stays with you when you join a new location."
    actions={<Link to="/account/" className="text-sm font-semibold text-primary underline underline-offset-4">
      My CAN account
    </Link>}>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Adult and community training</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Independent and facilitator-led noncredit training has its own published enrollment releases, separate from school admissions and youth enrichment.
      </p>
      <Link to="/learn/enroll" search={{}} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary underline underline-offset-4">
        Explore noncredit training
      </Link>
    </section>
    <section aria-label="Search available programs" className="mt-6 border border-border bg-card p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <label className="block text-sm font-semibold" htmlFor="explore-query">
          Program or location
          <span className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true"/>
            <input id="explore-query" type="search" value={text} onChange={event => setText(event.target.value)}
              placeholder="Search program, site or city"
              className="min-h-11 w-full border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"/>
          </span>
        </label>
        <label className="block text-sm font-semibold" htmlFor="explore-type">Program type
          <select id="explore-type" value={category} onChange={event => setCategory(event.target.value as Category)}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">
            <option value="all">All offerings</option>
            <option value="school">Schools and K–12</option>
            <option value="community">Summer and community</option>
          </select>
        </label>
      </div>
    </section>
    {query.isPending && <p role="status" className="mt-6 border border-border bg-card p-5 text-sm">
      Finding published programs…
    </p>}
    {query.isError && <div role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Program discovery is temporarily unavailable. <button type="button" className="text-primary underline"
        onClick={() => void query.refetch()}>Try again</button>
    </div>}
    {query.data && <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl">Available opportunities</h2>
        <p className="text-xs text-muted-foreground">{matches.length} matching offerings</p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {matches.map(program => <article key={program.site.slug + ":" + program.id}
          className="flex min-w-0 flex-col border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {program.category === "school" ? "School" : "Community program"}
            </span>
            <span className="text-xs text-muted-foreground">{program.status}</span>
          </div>
          <h3 className="mt-3 font-serif text-2xl">{program.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{program.description}</p>
          <div className="mt-5 flex items-start gap-2 border-t border-border pt-4">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
            <p className="text-xs text-muted-foreground">
              <span className="block font-semibold text-foreground">{program.site.siteName}</span>
              {program.site.organizationName}
              {[program.site.city, program.site.region].filter(Boolean).length > 0 &&
                " · " + [program.site.city, program.site.region].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="mt-auto pt-5">
            <a href={program.destination} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 border border-primary px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">
              {program.registrationOpen ? "View registration" : "View published program"}
              <ArrowUpRight className="size-4" aria-hidden="true"/>
            </a>
          </div>
        </article>)}
      </div>
      {!matches.length && <p role="status" className="mt-4 border border-border bg-card p-5 text-sm">
        No approved published opportunities match these filters. Try another program or place.
      </p>}
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        This is the first page of published sites, not a complete national catalog.
        Registration and admissions remain governed by the selected provider, including
        capacity, identity, guardian permissions and eligibility. Browsing never enrolls you.
      </p>
    </>}
  </WorkspaceShell>;
}
