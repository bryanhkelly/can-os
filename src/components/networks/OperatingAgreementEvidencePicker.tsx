import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { EvidencePicker } from "@/components/evidence/EvidencePicker";
import { listOperatingAgreementEvidenceFn } from "@/modules/programs/program-site-authorization.functions";

export function OperatingAgreementEvidencePicker({
  authorizationId, through, value, onChange, disabled,
}: {
  authorizationId: string; through: string; value: string;
  onChange: (id: string) => void; disabled: boolean;
}) {
  const end = new Date(through + "T00:00:00Z");
  const effectiveThrough = Number.isFinite(end.getTime()) ? end.toISOString() : "";
  const enabled = !!effectiveThrough && end > new Date();
  const query = useQuery({
    queryKey: ["operating-agreement-evidence", authorizationId, effectiveThrough],
    queryFn: () => listOperatingAgreementEvidenceFn({
      data: { authorizationId, effectiveThrough },
    }),
    enabled, retry: false, gcTime: 0,
  });
  const scope = authorizationId + ":" + effectiveThrough;
  const previousScope = useRef(scope);
  const candidates = enabled ? query.data?.candidates ?? [] : [];
  useEffect(() => {
    const changedScope = previousScope.current !== scope;
    previousScope.current = scope;
    // Pending/error states do not establish that a saved selection is invalid.
    // Only settled successful data for this scope may remove an eligible ID.
    if (value && (changedScope || !enabled ||
      (query.isSuccess && !query.isFetching && !query.isPlaceholderData &&
        !candidates.some(candidate => candidate.id === value)))) onChange("");
  }, [value, candidates, onChange, scope, enabled,
    query.isSuccess, query.isFetching, query.isPlaceholderData]);
  if (!enabled) return <p className="text-xs">
    Choose a future exclusive end date to find evidence covering the agreement period.
  </p>;
  return <>
    {query.isFetching && !query.isPending && <p className="text-xs" role="status">
      Refreshing eligible evidence…
    </p>}
    <EvidencePicker label="Independently verified two-party agreement"
    candidates={candidates} value={value} onChange={onChange} disabled={disabled || query.isFetching}
    loading={query.isPending}
    error={query.isError ? "Unable to load eligible agreement evidence." : undefined}
    onRetry={() => { void query.refetch(); }}
    emptyMessage="No eligible evidence covers this period. The agreement must be verified by someone other than the requester or reviewer."
    truncated={query.data?.truncated}/>
  </>;
}
