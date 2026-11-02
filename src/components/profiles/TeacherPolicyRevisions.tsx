import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { reviseLaunchTeacherPolicy } from "@/modules/programs/teacher-policy.functions";
import type { listLaunchTeacherPolicies } from "@/modules/programs/teacher-policy.server";

type Policy = Awaited<ReturnType<typeof listLaunchTeacherPolicies>>[number];

export function TeacherPolicyRevisions({ programId, policies, catalog, canRevise, changed }: {
  programId: string; policies: Policy[]; catalog: { key: string; title: string }[];
  canRevise: boolean; changed: () => Promise<void>;
}) {
  const latest = policies.at(-1);
  const mutation = useMutationFeedback(changed);
  const busy = mutation.pending || mutation.refreshFailed;
  const [keys, setKeys] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
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
      event.preventDefault();
      const outcome = await mutation.run(
        () => reviseLaunchTeacherPolicy({ data: {
          programId, expectedVersionId: latest.id, qualificationKeys: keys,
          effectiveFrom: effectiveFrom + ":00.000Z", reason, confirmed: true,
        } }),
        {
          successMessage: "Policy revision published. Review updated staffing blockers before opening.",
          commandErrorMessage: "Unable to publish policy revision.",
        },
      );
      if (outcome.status === "saved") setConfirmed(false);
    }}>
      <h3 className="font-semibold">Publish a reviewed revision</h3>
      <p className="text-sm">Select the complete replacement requirement set, not just additions.
        No claims, reviews or teaching assignments are changed. This is not a policy exception or regulatory approval.</p>
      {catalog.map(item => <Label key={item.key} className="flex items-center gap-2 leading-6">
        <Checkbox disabled={busy} checked={keys.includes(item.key)} onChange={event =>
          setKeys(current => event.target.checked ? [...current, item.key] : current.filter(key => key !== item.key))}/>
        {item.title} ({item.key})
      </Label>)}
      <Field label="Future effective date and time (UTC)" required>
        <Input disabled={busy} type="datetime-local" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)}/>
      </Field>
      <Field label="Reason for revision" required>
        <Textarea disabled={busy} minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)}/>
      </Field>
      <Label className="flex items-start gap-2 leading-6">
        <Checkbox disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
        I reviewed the complete requirement set and effective instant. Earlier policy history will be preserved.
      </Label>
      <Button type="submit" variant="outline" disabled={busy || !confirmed || !keys.length || !effectiveFrom || reason.trim().length < 10}>Publish policy revision</Button>
      <MutationFeedback state={mutation} pendingMessage="Publishing policy revision..."/>
    </form>}
  </section>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
