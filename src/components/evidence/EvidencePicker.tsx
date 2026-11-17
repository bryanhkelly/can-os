import { EvidenceDetails, type EvidenceSummary } from "./EvidenceDetails";
import { QueryState } from "@/components/workspace/query-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

export type EvidenceOption = EvidenceSummary;

/** Presentation only. Owning services supply authorized, eligible metadata. */
export function EvidencePicker({
  label, candidates, value, onChange, loading = false, error, disabled = false,
  onRetry, emptyMessage, truncated = false,
}: {
  label: string; candidates: readonly EvidenceOption[];
  value: string; onChange: (id: string) => void;
  loading?: boolean; error?: string; disabled?: boolean;
  onRetry?: () => void; emptyMessage: string; truncated?: boolean;
}) {
  const selected = candidates.find(candidate => candidate.id === value);
  return <div className="text-xs">
    <QueryState loading={loading && "Loading eligible evidence…"} error={error}
      onRetry={onRetry} retrying={loading}>
      <Field label={label}>
        <Select
        value={selected?.id ?? ""} disabled={disabled || candidates.length === 0}
        onChange={event => onChange(event.target.value)}>
        <option value="">Choose verified evidence…</option>
        {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
          {candidate.fileName} · Verified {candidate.verifiedAt.slice(0, 10)}
        </option>)}
        </Select>
      </Field>
      {!candidates.length && <p className="mt-2" role="status">{emptyMessage}</p>}
      {selected && <EvidenceDetails evidence={selected}/>}
      {truncated && <p className="mt-2" role="status">
        Only the latest 100 documents were checked. Older evidence may not appear.
      </p>}
    </QueryState>
  </div>;
}
