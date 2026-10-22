import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getNetworkSites, createNetworkSite } from "@/modules/networks/network-sites.functions";
import { WorkspaceShell, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/network")({
  loader: safeLoader(() => getNetworkSites(), {
    authMessage: "Sign in with a verified denomination HQ administrator membership.",
  }),
  component: NetworkHome,
});

function NetworkHome() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Network" title="Denomination HQ" outcome={result}/>;
  return <NetworkSites data={result.data} />;
}

function NetworkSites({ data }: { data: Awaited<ReturnType<typeof getNetworkSites>> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  return <WorkspaceShell eyebrow="CAN OS · Network partner" title={data.organization.name}
    subtitle="Denomination HQ can establish and manage its own locations. This does not grant access to school academic records or enroll students.">
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
