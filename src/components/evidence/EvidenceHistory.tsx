export interface EvidenceHistoryVersion {
  id: string;
  version: number;
  fileName: string;
  status: string;
  isCurrent: boolean;
  reviewReason?: string | null;
}
export function EvidenceHistory({ versions }: { versions: readonly EvidenceHistoryVersion[] }) {
  if (!versions.length) return null;
  return <details className="mt-3 text-xs">
    <summary>Version history ({versions.length})</summary>
    <ul className="mt-2 space-y-2">{versions.map(version => <li key={version.id} className="border-l pl-3">
      v{version.version} · {version.fileName} · {version.status}
      {version.isCurrent ? " · current" : " · superseded"}
      {version.reviewReason && <span> · Review: {version.reviewReason}</span>}
    </li>)}</ul>
  </details>;
}
