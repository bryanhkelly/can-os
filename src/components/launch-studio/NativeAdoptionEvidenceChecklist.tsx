import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import {
  nativeAdoptionReviewKinds, type NativeAdoptionEvidencePreview,
} from "@/domain/native-adoption-readiness";

/**
 * Read-only V6.1 evidence presentation. The service still checks the actual
 * Blueprint approvals, evidence signatures, Site grants and reviewer
 * independence inside the approval transaction.
 */
export function NativeAdoptionEvidenceChecklist({
  state,
}:{state:NativeAdoptionEvidencePreview}){
  const items=[
    {key:"blueprint",label:"Executed Blueprint for this exact Offering",
      recorded:state.blueprintExecutionRecorded},
    ...nativeAdoptionReviewKinds.map(kind=>({
      key:kind,label:kind[0]!.toUpperCase()+kind.slice(1)+" readiness review",
      recorded:state.readiness.some(row=>row.kind===kind&&row.recordedReady),
    })),
  ];
  return <section className="mt-3 border border-border bg-background p-4"
    aria-label="Local adoption prerequisite records">
    <h4 className="text-sm font-semibold">Local adoption prerequisites</h4>
    {state.evidencePreviewLimited&&<WorkspaceNotice tone="attention" className="mt-3">
      Review evidence exceeded the bounded preview. Reconcile the record history before approval.
    </WorkspaceNotice>}
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map(item=><li key={item.key}
        className="flex items-start justify-between gap-3 border border-border p-3 text-xs">
        <span>{item.label}</span>
        <StatusBadge tone={!state.evidencePreviewLimited&&item.recorded?"success":"attention"}>
          {!state.evidencePreviewLimited&&item.recorded?"Record visible":"Not verified"}
        </StatusBadge>
      </li>)}
    </ul>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">
      A visible execution or readiness record does not mean approval. The existing
      command separately verifies exact-version Blueprint review, authorized
      operating Sites, evidence currency and independent reviewer identity.
    </p>
  </section>;
}
