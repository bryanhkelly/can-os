import { useState } from "react";
import { reviseLaunchTeacherPolicy } from "@/modules/programs/teacher-policy.functions";
import type { listLaunchTeacherPolicies } from "@/modules/programs/teacher-policy.server";

type Policy = Awaited<ReturnType<typeof listLaunchTeacherPolicies>>[number];

export function TeacherPolicyRevisions({ programId, policies, catalog, canRevise, changed }: {
  programId: string; policies: Policy[]; catalog: { key: string; title: string }[];
  canRevise: boolean; changed: () => Promise<void>;
}) {
  const latest = policies.at(-1);
  const [keys, setKeys] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!policies.length) return null;
  return <section className="mt-5 border-t pt-4">
    <h3 className="font-semibold">Published policy versions</h3>
    <p className="mt-2 text-sm">Effective instants are shown in UTC. Earlier requirements remain in force before each change.
      Every assigned instructor must satisfy each applicable version throughout instruction, or opening is blocked.</p>
    <ol className="mt-3 space-y-2">{policies.map(policy => <li key={policy.id} className="rounded border p-3 text-sm">
      <strong>Version {policy.version}</strong> · {policy.status}
      <p>From {policy.effectiveFrom ?? "initial publication (unbounded start)"} until {policy.effectiveThrough ?? "no scheduled end"} (end exclusive)</p>
      <p>{policy.qualificationKeys?.map(key => `${catalog.find(item => item.key === key)?.title ?? key} (${key})`).join(", ")
        ?? "Specialized requirements: this editor cannot revise this policy."}</p>
    </li>)}</ol>
    {!canRevise ? <p className="mt-3 text-sm">Revisions require an explicit institutional staffing-policy publisher grant
      and a pre-opening program.</p> : latest && <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setNotice("");
      try {
        await reviseLaunchTeacherPolicy({ data: {
          programId, expectedVersionId: latest.id, qualificationKeys: keys,
          effectiveFrom: effectiveFrom + ":00.000Z", reason, confirmed: true,
        } });
        await changed(); setNotice("Policy revision published. Review updated staffing blockers before opening.");
        setConfirmed(false);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Unable to publish policy revision");
      } finally { setBusy(false); }
    }}>
      <h3 className="font-semibold">Publish a reviewed revision</h3>
      <p className="text-sm">Select the complete replacement requirement set, not just additions.
        No claims, reviews or teaching assignments are changed. This is not a policy exception or regulatory approval.</p>
      {catalog.map(item => <label key={item.key} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={keys.includes(item.key)} onChange={event =>
          setKeys(current => event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key))}/>
        {item.title} ({item.key})
      </label>)}
      <label className="block text-sm">Future effective date and time (UTC)
        <input type="datetime-local" required value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)}
          className="mt-1 block rounded border bg-background p-2"/>
      </label>
      <label className="block text-sm">Reason for revision
        <textarea required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2"/>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
        I reviewed the complete requirement set and effective instant. Earlier policy history will be preserved.
      </label>
      <button type="submit" disabled={busy || !confirmed || !keys.length || !effectiveFrom || reason.trim().length < 10}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Publish policy revision</button>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>}
  </section>;
}
