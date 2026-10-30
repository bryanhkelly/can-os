import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getNetworkSites, createNetworkSite } from "@/modules/networks/network-sites.functions";
import { listNetworkAffiliations, reviewNetworkAffiliation } from "@/modules/networks/network-affiliations.functions";
import { WorkspaceShell, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/network")({
  loader: safeLoader(async () => {
    const [sites, affiliations] = await Promise.all([getNetworkSites(), listNetworkAffiliations()]);
    return { ...sites, affiliations: affiliations.entries };
  }, {
    authMessage: "Sign in with a verified denomination HQ administrator membership.",
  }),
  component: NetworkHome,
});

function NetworkHome() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Network" title="Denomination HQ" outcome={result}/>;
  return <NetworkSites data={result.data} />;
}

type NetworkData = Awaited<ReturnType<typeof getNetworkSites>> & {
  affiliations: Awaited<ReturnType<typeof listNetworkAffiliations>>["entries"];
};

function NetworkSites({ data }: { data: NetworkData }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const outcome = await createNetworkSite({ data: { name, slug, timezone } });
      await router.invalidate();
      setNotice(outcome.created ? "Location created for your denomination." : "This location already exists.");
      setName(""); setSlug("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create denomination location");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "approve" | "reject" | "revoke") {
    setBusy(true); setError(""); setNotice("");
    try {
      await reviewNetworkAffiliation({ data: {
        affiliationId: id, decision, reason: reasons[id] ?? "",
      } });
      await router.invalidate();
      setNotice("Affiliation decision recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review affiliation.");
    } finally { setBusy(false); }
  }

  return <WorkspaceShell eyebrow="CAN OS · Network partner" title={data.organization.name}
    subtitle="Denomination HQ can establish and manage its own locations. This does not grant access to school academic records or enroll students.">
    <section className="mt-8 rounded-xl border bg-card p-5">
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
    <section className="mt-8 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-2xl">Add a headquarters-operated location</h2>
      <p className="mt-2 text-sm text-muted-foreground">Use this only for a location owned or operated by the denomination. Independently owned churches and schools require a reviewed affiliation link, not a transfer of site ownership.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={create}>
        <label className="text-sm font-medium">Location name
          <input required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)}
            className="mt-1 block w-full rounded-lg border bg-background p-3" placeholder="Central Community Campus"/>
        </label>
        <label className="text-sm font-medium">Unique location code
          <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => setSlug(event.target.value)}
            className="mt-1 block w-full rounded-lg border bg-background p-3" placeholder="central-community"/>
        </label>
        <label className="text-sm font-medium">IANA timezone
          <input required value={timezone} onChange={event => setTimezone(event.target.value)}
            className="mt-1 block w-full rounded-lg border bg-background p-3" placeholder="America/Los_Angeles"/>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            {busy ? "Creating location…" : "Create location"}
          </button>
        </div>
      </form>
      {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
    </section>
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Directly operated locations</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.sites.map(site => <article key={site.id} className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{site.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{site.slug} · {site.timezone}</p>
        </article>)}
      </div>
      {!data.sites.length && <EmptyState title="No headquarters-operated sites yet." />}
    </section>
  </WorkspaceShell>;
}
