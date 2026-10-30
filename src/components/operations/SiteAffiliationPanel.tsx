import { useEffect, useState } from "react";
import {
  listAffiliationNetworks, listSiteAffiliations, requestSiteAffiliation, withdrawSiteAffiliation,
} from "@/modules/networks/network-affiliations.functions";

type Network = Awaited<ReturnType<typeof listAffiliationNetworks>>["networks"][number];
type Entry = Awaited<ReturnType<typeof listSiteAffiliations>>["entries"][number];

export function SiteAffiliationPanel({ siteId }: { siteId: string }) {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [options, current] = await Promise.all([
      listAffiliationNetworks(), listSiteAffiliations({ data: { siteId } }),
    ]);
    setNetworks(options.networks);
    setEntries(current.entries);
  }
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([listAffiliationNetworks(), listSiteAffiliations({ data: { siteId } })])
      .then(([options, current]) => {
        if (!live) return;
        setNetworks(options.networks);
        setEntries(current.entries);
      }).catch(() => { if (live) setError("Affiliations are unavailable for this site."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [siteId]);

  async function request(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (!selected) throw new Error("Choose a denomination.");
      const outcome = await requestSiteAffiliation({ data: {
        siteId, denominationOrganizationId: selected, note,
      } });
      await refresh();
      setNote(""); setSelected("");
      setNotice(outcome.created ? "Affiliation request sent for HQ review." : "This affiliation already exists.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request could not be sent.");
    } finally { setBusy(false); }
  }

  async function withdraw(affiliationId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await withdrawSiteAffiliation({ data: { siteId, affiliationId } });
      await refresh();
      setNotice("Affiliation withdrawn.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to withdraw affiliation.");
    } finally { setBusy(false); }
  }

  return <section className="mt-3 rounded-xl border bg-card p-5" aria-label="Denomination affiliation">
    <h3 className="text-base font-semibold">Denomination affiliation</h3>
    <p className="mt-1 text-sm text-muted-foreground">Request a relationship with a denomination. Your school retains ownership, and approval does not share student, family or academic records.</p>
    {loading ? <p className="mt-3 text-sm" role="status">Loading network affiliations…</p> : <>
      {entries.length > 0 && <ul className="mt-4 space-y-2">
        {entries.map(entry => <li key={entry.id} className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">{entry.denominationName}</span> · {entry.status}
          {entry.decisionReason && <p className="mt-1 text-muted-foreground">HQ decision: {entry.decisionReason}</p>}
          {(entry.status === "pending" || entry.status === "approved") &&
            <button type="button" className="mt-2 block text-sm underline disabled:opacity-50"
              disabled={busy} onClick={() => void withdraw(entry.id)}>Withdraw affiliation</button>}
        </li>)}
      </ul>}
      {networks.length ? <form onSubmit={request} className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Denomination
          <select required value={selected} onChange={e => setSelected(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background p-2">
            <option value="">Choose a denomination…</option>
            {networks.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Reason for affiliation request
          <textarea required minLength={10} maxLength={1000} value={note}
            onChange={e => setNote(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border bg-background p-2"
            placeholder="Our school would like to join this network…"/>
        </label>
        <button type="submit" disabled={busy}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
          {busy ? "Submitting…" : "Request affiliation"}
        </button>
      </form> : <p className="mt-3 text-sm text-muted-foreground">No denomination HQ accounts are currently available for affiliation requests.</p>}
    </>}
    {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
  </section>;
}
