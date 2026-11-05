import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { Building2, ClipboardList, CalendarDays, MessageCircle } from "lucide-react";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getNetworkSites, createNetworkSite } from "@/modules/networks/network-sites.functions";
import { listNetworkAffiliations, reviewNetworkAffiliation } from "@/modules/networks/network-affiliations.functions";
import { EmptyState } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const loadNetworkHome = safeLoader(async () => {
    const [sites, affiliations] = await Promise.all([getNetworkSites(), listNetworkAffiliations()]);
    return { ...sites, affiliations: affiliations.entries };
  }, {
    authMessage: "Sign in with a verified denomination HQ administrator membership.",
  });

export function NetworkHome({ result }: { result: Awaited<ReturnType<typeof loadNetworkHome>> }) {
  if (!result.ok) return <LoaderFailure eyebrow="Network" title="Denomination HQ" outcome={result}/>;
  return <NetworkSites data={result.data} />;
}

type NetworkData = Awaited<ReturnType<typeof getNetworkSites>> & {
  affiliations: Awaited<ReturnType<typeof listNetworkAffiliations>>["entries"];
};
function isValidTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
  catch { return false; }
}

function NetworkSites({ data }: { data: NetworkData }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [createAttempted,setCreateAttempted]=useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreateAttempted(true);
    if(name.trim().length<2||!(/^[a-z0-9]+(-[a-z0-9]+)*$/).test(slug)||!isValidTimezone(timezone))return;
    await mutation.run(async () => {
      const outcome = await createNetworkSite({ data: { name, slug, timezone } });
      setName(""); setSlug("");
      setCreateAttempted(false);
      return outcome;
    }, { successMessage: outcome => outcome.created ? "Location created for your denomination." : "This location already exists.",
      commandErrorMessage: "Unable to create denomination location." });
  }

  async function decide(id: string, decision: "approve" | "reject" | "revoke") {
    await mutation.run(() => reviewNetworkAffiliation({ data: {
        affiliationId: id, decision, reason: reasons[id] ?? "",
      } }), { successMessage: "Affiliation decision recorded.", commandErrorMessage: "Unable to review affiliation." });
  }

  return <DashboardHome eyebrow={data.organization.name}
    subtitle="Denomination HQ can establish and manage its own locations. This does not grant access to school academic records or enroll students."
    shortcuts={<>
      <DashboardShortcut title="Affiliations" description={`${data.affiliations.filter(entry=>entry.status==="pending").length} requests pending review`} icon={<ClipboardList className="size-5" />}><a href="#network-affiliations" /></DashboardShortcut>
      <DashboardShortcut title="Locations" description={`${data.sites.length} directly operated locations`} icon={<Building2 className="size-5" />}><a href="#network-locations" /></DashboardShortcut>
      <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><Link to="/calendar" /></DashboardShortcut>
      <DashboardShortcut title="Messages" description="Partner conversations" icon={<MessageCircle className="size-5" />}><Link to="/messages" /></DashboardShortcut>
    </>}
    actions={<><a href="#network-create">Add an HQ-operated location →</a><Link to="/profiles">My profile →</Link></>}>
    <section id="network-affiliations" className="border bg-card p-5">
      <h2 className="font-serif text-2xl">School affiliation requests</h2>
      <p className="mt-2 text-sm text-muted-foreground">Schools retain their own organizations and academic permissions. Approving a link does not give HQ access to students, families, courses or admissions.</p>
      <div className="mt-4 space-y-3">
        {data.affiliations.map(entry => <article key={entry.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{entry.siteName}</h3>
            <span className="text-xs text-muted-foreground">{entry.siteOrganizationName} · {entry.status}</span>
          </div>
          <p className="mt-2 text-sm">{entry.requestNote}</p>
          {entry.decisionReason && <p className="mt-2 text-sm text-muted-foreground">Last decision: {entry.decisionReason}</p>}
          {(entry.status === "pending" || entry.status === "approved") && <>
            <label className="mt-3 block text-sm font-medium">Decision reason
              <textarea rows={2} minLength={4} maxLength={1000}
                className="mt-1 w-full rounded-lg border bg-background p-2"
                placeholder="Reason for this network decision"
                value={reasons[entry.id] ?? ""}
                onChange={event => setReasons(old => ({ ...old, [entry.id]: event.target.value }))}/>
            </label>
            <div className="mt-2 flex gap-2">
              {entry.status === "pending" ? <>
                <button disabled={busy || (reasons[entry.id] ?? "").trim().length < 4}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => void decide(entry.id, "approve")}>Approve</button>
                <button disabled={busy || (reasons[entry.id] ?? "").trim().length < 4}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => void decide(entry.id, "reject")}>Reject</button>
              </> : <button disabled={busy || (reasons[entry.id] ?? "").trim().length < 4}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void decide(entry.id, "revoke")}>Revoke affiliation</button>}
            </div>
          </>}
        </article>)}
        {data.affiliations.length === 0 && <p className="text-sm text-muted-foreground">No school affiliation requests yet.</p>}
      </div>
    </section>
    <section id="network-create" className="mt-8 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-2xl">Add a headquarters-operated location</h2>
      <p className="mt-2 text-sm text-muted-foreground">Use this only for a location owned or operated by the denomination. Independently owned churches and schools require a reviewed affiliation link, not a transfer of site ownership.</p>
      <form noValidate className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={create}>
        <Field label="Location name" className="text-sm" required error={createAttempted&&name.trim().length<2?"Enter a location name with at least 2 characters.":undefined}>
          <Input minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="Central Community Campus"/>
        </Field>
        <Field label="Unique location code" className="text-sm" required
          error={createAttempted&&!(/^[a-z0-9]+(-[a-z0-9]+)*$/).test(slug)?"Use lowercase letters, digits, and single hyphens between words.":undefined}>
          <Input pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => setSlug(event.target.value)} placeholder="central-community"/>
        </Field>
        <Field label="IANA timezone" className="text-sm" required
          error={createAttempted&&!isValidTimezone(timezone)?"Enter a valid IANA timezone, such as America/Los_Angeles.":undefined}>
          <Input value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="America/Los_Angeles"/>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating location…" : "Create location"}
          </Button>
        </div>
      </form>
      <MutationFeedback state={mutation} className="mt-3" pendingMessage="Recording network change..."/>
    </section>
    <section id="network-locations" className="mt-8 border bg-card p-5">
      <h2 className="font-serif text-2xl">Directly operated locations</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.sites.map(site => <article key={site.id} className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{site.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{site.slug} · {site.timezone}</p>
        </article>)}
      </div>
      {!data.sites.length && <EmptyState title="No headquarters-operated sites yet." />}
    </section>
  </DashboardHome>;
}
