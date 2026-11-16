import {createFileRoute, Link, redirect} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useState} from "react";
import {ArrowUpRight, BookOpen, CalendarDays, Clock3, History, MapPin, RefreshCw, Users} from "lucide-react";
import {WorkspaceShell} from "@/components/workspace";
import {Button} from "@/components/ui/button";
import {workspaceSessionQueryOptions, useWorkspaceSession} from "@/components/shell/WorkspaceSession";
import {getMyActivity} from "@/modules/learning/my-activity.functions";
import {
  activityStatusLabel, resolveActivityFilters,
  type ParticipationBucket, type ParticipationKind,
  type ParticipationRecord,
} from "@/domain/participation-read-model";

export const Route = createFileRoute("/learn/my-activity")({
  loader: async ({context, location}) => {
    const result = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!result.session?.authenticated)
      throw redirect({to: "/access", search: {returnTo: location.href}});
  },
  component: MyActivityPage,
});

const views: {id: ParticipationBucket; title: string; Icon: typeof BookOpen}[] = [
  {id: "current", title: "Current", Icon: BookOpen},
  {id: "upcoming", title: "Upcoming", Icon: Clock3},
  {id: "history", title: "History", Icon: History},
];
const filters: {id: ParticipationKind | "all"; title: string}[] = [
  {id: "all", title: "All"}, {id: "learning", title: "Learning"},
  {id: "program", title: "Programs"}, {id: "event", title: "Events"},
  {id: "other", title: "Other"},
];
function displayDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  }) : null;
}
function ActivityCard({item}: {item: ParticipationRecord}) {
  const next = displayDate(item.nextAt);
  const start = displayDate(item.startAt);
  const end = displayDate(item.endAt);
  const isDependent = item.subject.kind === "dependent";
  return <article className="border border-border bg-card p-4 sm:p-5" data-participation-key={item.key}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">{item.kind}</span>
          <span aria-hidden="true">·</span>
          <span className="border border-border bg-muted/40 px-2 py-1 text-foreground">
            {activityStatusLabel(item.status)}
          </span>
        </div>
        <h2 className="mt-3 font-serif text-xl leading-snug sm:text-2xl">{item.title}</h2>
        {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {isDependent && <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden="true"/>
            {item.subject.displayName ?? "Authorized dependent"}
          </span>}
          {item.organizationName && <span>{item.organizationName}</span>}
          {item.siteName && <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true"/>{item.siteName}
          </span>}
          {next && <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true"/>Next: {next}
          </span>}
          {!next && start && <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true"/>Starts: {start}
          </span>}
          {end && item.bucket === "history" && <span>Ended: {end}</span>}
        </div>
        {item.progress && <p className="mt-3 text-sm text-muted-foreground">
          {item.progress.label}: {item.progress.completed} of {item.progress.total}
        </p>}
        {item.outcome && <p className="mt-3 text-sm font-medium">{item.outcome.label}</p>}
      </div>
      {item.action && <a href={item.action.href}
        className="inline-flex min-h-10 shrink-0 items-center gap-2 border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {item.action.label}<ArrowUpRight className="size-4" aria-hidden="true"/>
      </a>}
    </div>
  </article>;
}
function MyActivityPage() {
  const {session} = useWorkspaceSession();
  const [bucket, setBucket] = useState<ParticipationBucket>("current");
  const [kind, setKind] = useState<ParticipationKind | "all">("all");
  const activity = useQuery({
    queryKey: ["my-activity", session?.authenticated ? session.activeGrantId : null],
    queryFn: () => getMyActivity(),
    retry: false,
    staleTime: 15_000,
  });
  const records = activity.data?.records ?? [];
  const shown = resolveActivityFilters(records, bucket, kind);
  const unavailable = activity.data?.sources.filter(item => item.state === "unavailable") ?? [];
  return <WorkspaceShell width="wide" eyebrow="My CAN" title="My Activity"
    subtitle="Your learning, programs, and participation in one place. Each provider keeps authority over its own records."
    actions={<Link to="/explore" className="text-sm font-semibold text-primary underline underline-offset-4">
      Explore opportunities
    </Link>}>
    <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Participation summary">
      {views.map(view => <button type="button" key={view.id}
        onClick={() => setBucket(view.id)} aria-pressed={bucket === view.id}
        className={"flex items-center gap-4 border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          (bucket === view.id ? "border-primary bg-muted/40" : "border-border bg-card hover:bg-muted/30")}>
        <view.Icon className="size-5 text-primary" aria-hidden="true"/>
        <span className="flex-1">
          <span className="block text-xs uppercase tracking-widest text-muted-foreground">{view.title}</span>
          <span className="mt-1 block font-serif text-3xl">
            {activity.data ? records.filter(record => record.bucket === view.id).length : "—"}
          </span>
        </span>
      </button>)}
    </section>

    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter participation type">
        {filters.map(filter => <Button key={filter.id} size="sm" type="button"
          variant={kind === filter.id ? "default" : "outline"}
          className="rounded-none" aria-pressed={kind === filter.id}
          onClick={() => setKind(filter.id)}>{filter.title}</Button>)}
      </div>
      <Button type="button" variant="outline" size="sm" className="rounded-none"
        disabled={activity.isFetching} onClick={() => void activity.refetch()}>
        <RefreshCw className="mr-2 size-4" aria-hidden="true"/>
        {activity.isFetching ? "Refreshing" : "Refresh"}
      </Button>
    </div>

    {activity.isPending && <div role="status" className="mt-5 border border-border bg-card p-6 text-sm">
      Loading verified learning and program records…
    </div>}
    {activity.isError && <div role="alert" className="mt-5 border border-border bg-card p-6">
      <h2 className="font-semibold">My Activity is unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your current session or participation could not be verified. No records were displayed.</p>
      <Button type="button" variant="outline" className="mt-4 rounded-none"
        onClick={() => void activity.refetch()}>Try again</Button>
    </div>}

    {activity.data && <>
      {unavailable.length > 0 && <div role="status" className="mt-5 border border-border bg-muted/30 p-4 text-sm">
        <p className="font-semibold">Some sources could not be verified.</p>
        <p className="mt-1 text-muted-foreground">Items from unavailable sources may be missing. Existing access and private records have not changed.</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {unavailable.map(item => item.source.replaceAll("_", " ")).join(" · ")}
        </p>
      </div>}
      <section className="mt-6" aria-label={bucket + " activity"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl">{views.find(view => view.id === bucket)?.title} activity</h2>
          <p className="text-sm text-muted-foreground">{shown.length} {shown.length === 1 ? "item" : "items"}</p>
        </div>
        {shown.length ? <div className="mt-3 grid gap-3">
          {shown.map(item => <ActivityCard key={item.key} item={item}/>)}
        </div> : <div className="mt-3 border border-border bg-card p-6">
          <h3 className="font-serif text-xl">Nothing to display in this view</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {unavailable.length ? "Some sources are unavailable, so this view may be incomplete." :
              "No verified participation matches these filters in the active workspace."}
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <button type="button" className="font-semibold text-primary underline"
              onClick={() => {setBucket("current"); setKind("all");}}>Clear filters</button>
            <Link to="/explore" className="font-semibold text-primary underline">Explore opportunities</Link>
          </div>
        </div>}
      </section>
      <section className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">
        <h2 className="font-semibold text-foreground">One CAN account, independently authorized access</h2>
        <p className="mt-2">This view uses your current verified workspace and each provider's own permissions.
          Another Site, guardian relationship, or staff role does not grant access to private learner activity.
          History is retained by its original records, not recreated here.</p>
        <p className="mt-3">
          <Link to="/account" className="font-semibold text-primary underline">Manage authorized workspaces</Link>
          {" · "}
          <Link to="/learn/my-courses" className="font-semibold text-primary underline">Manage training registrations and waiting lists</Link>
        </p>
      </section>
    </>}
  </WorkspaceShell>;
}
