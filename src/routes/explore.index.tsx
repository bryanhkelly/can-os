import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { getMyCanDiscoverablePrograms } from "@/modules/identity/my-can-discovery.functions";

export const Route=createFileRoute("/explore/")({component:ExplorePage});
type Category="all"|"school"|"community";

function ExplorePage(){
  const [text,setText]=useState("");
  const [category,setCategory]=useState<Category>("all");
  const [cursor,setCursor]=useState<string|null>(null);
  const [history,setHistory]=useState<(string|null)[]>([]);
  const term=useDeferredValue(text.trim());
  const query=useQuery({
    queryKey:["my-can-discovery",term,category,cursor],
    queryFn:()=>getMyCanDiscoverablePrograms({data:{term,category,cursor}}),
    retry:false,staleTime:30_000,
  });
  function chooseCategory(value:Category){
    setCategory(value);setCursor(null);setHistory([]);
  }
  function chooseText(value:string){
    setText(value);setCursor(null);setHistory([]);
  }
  const matches=query.data?.locations.flatMap(site=>
    site.programs.map(program=>({...program,site})))??[];
  return <WorkspaceShell eyebrow="Discovery" title="Explore programs and places" width="wide"
    subtitle="Find approved programs across participating schools and learning centers. Your CAN account follows you to new locations."
    actions={<Link to="/account/" className="text-sm font-semibold text-primary underline underline-offset-4">My CAN account</Link>}>
    <section aria-label="Search available programs" className="mt-6 border border-border bg-card p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <label className="block text-sm font-semibold" htmlFor="explore-query">
          Program or location
          <span className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true"/>
            <input id="explore-query" type="search" value={text} onChange={event=>chooseText(event.target.value)}
              maxLength={100} placeholder="Program, site, city or region"
              className="min-h-11 w-full border border-border bg-background pl-10 pr-3 text-sm"/>
          </span>
        </label>
        <label className="block text-sm font-semibold" htmlFor="explore-type">Program type
          <select id="explore-type" value={category} onChange={event=>chooseCategory(event.target.value as Category)}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
            <option value="all">All offerings</option>
            <option value="school">Schools and K–12</option>
            <option value="community">Summer and community</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Searches reviewed public programs throughout the published directory. Private rosters and unpublished programs are never included.</p>
      <Link to="/learn/enroll" search={{}} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary underline">
        Register for independent and facilitator-led adult training
      </Link>
    </section>
    {query.isPending&&<p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Searching the published directory…</p>}
    {query.isError&&<div role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Program discovery is unavailable. <button type="button" className="text-primary underline" onClick={()=>void query.refetch()}>Try again</button>
    </div>}
    {query.data&&<section aria-label="Published search results">
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl">Available opportunities</h2>
        <p className="text-xs text-muted-foreground">{matches.length} offerings on this page</p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {matches.map(program=><article key={program.site.slug+":"+program.id}
          className="flex min-w-0 flex-col border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {program.category==="school"?"School":"Community program"}
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
              {[program.site.city,program.site.region].filter(Boolean).length>0 &&
                " · "+[program.site.city,program.site.region].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="mt-auto pt-5">
            <a href={program.destination} rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 border border-primary px-4 py-2 text-sm font-semibold text-primary">
              {program.registrationOpen?"View registration":"View published program"}
              <ArrowUpRight className="size-4" aria-hidden="true"/>
            </a>
          </div>
        </article>)}
      </div>
      {!matches.length&&<p role="status" className="mt-4 border border-border bg-card p-5 text-sm">
        {query.data.hasMore?"No matching opportunities in this segment. Continue searching for more locations.":"No approved published opportunities match these filters."}
      </p>}
      <nav aria-label="Search result pages" className="mt-5 flex items-center gap-3">
        <Button variant="outline" disabled={query.isFetching||history.length===0}
          onClick={()=>{
            const previous=history[history.length-1]??null;
            setCursor(previous);setHistory(h=>h.slice(0,-1));
          }}>Previous</Button>
        <Button variant="outline" disabled={query.isFetching||!query.data.hasMore||!query.data.nextCursor}
          onClick={()=>{
            if(!query.data?.nextCursor)return;
            setHistory(h=>[...h,cursor]);setCursor(query.data.nextCursor);
          }}>Next locations</Button>
      </nav>
      <p className="mt-3 text-xs text-muted-foreground">Every page scans a bounded segment of the national directory. Results are not a count of all enrolled participants or available seats.</p>
    </section>}
  </WorkspaceShell>;
}
