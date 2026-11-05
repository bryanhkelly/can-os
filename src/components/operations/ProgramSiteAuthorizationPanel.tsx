import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getHostProgramSiteAuthorizationFn, requestProgramSiteAuthorizationFn,
  revokeProgramSiteAuthorizationFn,
} from "@/modules/programs/program-site-authorization.functions";
import { operatingServices, type OperatingService } from "@/domain/program-site-operating-policy";

type Status = Awaited<ReturnType<typeof getHostProgramSiteAuthorizationFn>>;

/** This only requests an agreement. School opening and CAN staff grants remain separate. */
export function ProgramSiteAuthorizationPanel({programId}:{programId:string}) {
  const router = useRouter();
  const [status,setStatus] = useState<Status|null>(null);
  const [selected,setSelected] = useState<OperatingService[]>([]);
  const [refreshing,setRefreshing] = useState(false);
  const [readFailed,setReadFailed] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [revokeReason,setRevokeReason] = useState("");
  const [revokeAttempted,setRevokeAttempted] = useState(false);
  const [requestAttempted,setRequestAttempted] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await getHostProgramSiteAuthorizationFn({data:{programId}});
      setStatus(result);
      setReadFailed(false);
      // The first proposal includes the services needed after school opening,
      // not just the launch gate. Keep a user-edited proposal across refreshes.
      setSelected(current => current.length ? current.filter(service =>
        result.canIssueCredit || service !== "credit_issuance") : result.recommendedServices);
    } catch (cause) {
      setReadFailed(true);
      throw cause;
    }
  },[programId]);
  const mutation = useMutationFeedback(async () => {
    await load();
    await router.invalidate();
  });
  const busy = refreshing || mutation.pending || mutation.refreshFailed || readFailed;
  useEffect(()=>{
    let current = true;
    void load().catch(e=>{
      if(current){setStatus(null);setError(mutationErrorMessage(e, "Unable to load agreement status"));}
    });
    return ()=>{current=false;};
  },[load]);
  async function refresh() {
    setRefreshing(true);setError("");setNotice("");
    try {
      await load();
      // Recompute the owning route's academic authority and classroom readiness
      // from canonical services after an independent agreement lifecycle change.
      await router.invalidate();
    } catch(e) {
      setStatus(null);
      setError(mutationErrorMessage(e, "Unable to refresh agreement and readiness"));
    } finally { setRefreshing(false); }
  }
  async function request() {
    setError("");setNotice("");
    setRequestAttempted(true);
    if(!selected.length)return;
    await mutation.run(
      () => requestProgramSiteAuthorizationFn({data:{programId,services:selected}}),
      {
        successMessage: "Request recorded for independent CAN institutional review.",
        commandErrorMessage: "Request failed",
        refreshErrorMessage: "The authorization request was recorded, but current agreement and readiness records could not be loaded. Retry the refresh before submitting another request.",
      },
    );
  }
  async function revoke() {
    if(!status?.authorization) return;
    setRevokeAttempted(true);
    if(revokeReason.trim().length<10)return;
    const authorization=status.authorization;
    setError("");setNotice("");
    await mutation.run(
      () => revokeProgramSiteAuthorizationFn({data:{
        authorizationId:authorization.id,reason:revokeReason,
      }}),
      {
        successMessage: "Operating authorization revoked; new delegated activity is blocked.",
        commandErrorMessage: "Revocation failed",
        refreshErrorMessage: "Operating authorization was revoked, but current agreement and readiness records could not be loaded. Retry the refresh before submitting another change.",
      },
    );
  }
  if(status && !status.eligible) return null;
  return <section className="mt-7 rounded-xl border bg-card p-5" aria-label="CAN church institutional authorization">
    <h2 className="font-serif text-2xl">CAN–church operating agreement</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      A church-owned Site can request separately authorized CAN academic services without
      transferring church ownership. The contract, individual staff grants, school opening
      and safeguarding approvals are independent checks.
    </p>
    <button type="button" disabled={refreshing||mutation.pending||mutation.refreshFailed} onClick={()=>void refresh()}
      className="mt-3 min-h-11 rounded border px-3 py-2 text-sm disabled:opacity-50">
      {busy?"Updating…":"Refresh agreement and readiness"}
    </button>
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Updating agreement and readiness…"/>
    <p className="mt-2 text-xs text-muted-foreground">
      After CAN reviews, renews or withdraws this agreement, refresh to recheck the
      current service authority and academic setup. Only CAN can approve institutional services;
      the church supplies the signed agreement and completes its own opening requirements.
    </p>
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {!status?(error?<p className="mt-3 text-sm text-muted-foreground">Agreement status is unavailable. Ask your host registrar or CAN contact to review it, or refresh to try again. You can continue preparing the other school setup steps.</p>:<p role="status" className="mt-3 text-sm">Checking institutional authorization…</p>):
    status.authorization?<div className="mt-3 text-sm">
      <p><strong>Request v{status.authorization.version}:</strong> {status.authorization.status}
        {status.authorization.lapsed&&" — lapsed"}</p>
      {status.authorization.lapsed&&<p role="status" className="mt-2">
        The agreement window has elapsed. Delegated CAN operations are blocked
        until the independent CAN steward renews the agreement under fresh evidence.
        {status.authorization.status==="suspended"&&" The suspension must also be resolved by CAN before services can resume."}
      </p>}
      {status.authorization.status==="requested"&&<p role="status" className="mt-2">
        Awaiting independent CAN review of the agreement and its verified evidence.
        You can continue planning classes, but this request does not open admissions or the school.
      </p>}
      {status.authorization.status==="suspended"&&<p role="status" className="mt-2">
        CAN has suspended this agreement. Delegated services are blocked.
        Contact your CAN steward for review and resumption, or revoke the agreement below.
        School opening authorization remains a separate requirement.
      </p>}
      {status.authorization.status==="suspended"&&status.authorization.suspensionReason&&
        <p className="mt-2 text-xs">CAN suspension reason: {status.authorization.suspensionReason}</p>}
      {status.authorization.effectiveFrom&&<p className="mt-1 text-xs">
        Term begins: {new Date(status.authorization.effectiveFrom).toLocaleString()}
      </p>}
      <p className="mt-1 text-xs">Services: {status.authorization.services.join(", ")}</p>
      {status.authorization.effectiveThrough&&<p className="mt-1 text-xs">
        Term ends (exclusive): {new Date(status.authorization.effectiveThrough).toLocaleString()}
      </p>}
      {status.authorization.reviewReason&&<p className="mt-2 text-xs">
        Institutional review: {status.authorization.reviewReason}
      </p>}
      {(status.authorization.status==="approved"||status.authorization.status==="suspended")&&<form noValidate onSubmit={e=>{e.preventDefault();void revoke();}} className="mt-3 space-y-2">
        <Field label="Reason for withdrawing church-hosted authority" className="text-xs" required
          error={revokeAttempted&&revokeReason.trim().length<10?"Enter at least 10 characters explaining this revocation.":undefined}>
          <Input value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} maxLength={500}/>
        </Field>
        <Button type="submit" variant="outline" disabled={busy}>Revoke authorization</Button>
      </form>}
      {(status.authorization.status==="denied"||status.authorization.status==="revoked")&&
        <button type="button" disabled={busy} onClick={()=>void request()}
          className="mt-3 rounded border px-3 py-2 text-xs">Request new agreement version</button>}
    </div>:
    <div className="mt-3">
      <p className="text-sm font-semibold">Request service scope</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {operatingServices.filter(service=>status.canIssueCredit||service!=="credit_issuance")
          .map(service=><label key={service} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={selected.includes(service)} onChange={e=>setSelected(v=>
            e.target.checked?[...v,service]:v.filter(x=>x!==service))}/>
          {service.replace(/_/g," ")}
        </label>)}
      </div>
      {requestAttempted&&!selected.length&&<FieldError className="mt-2">Select at least one requested service.</FieldError>}
      <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={()=>void request()}>
        {busy?"Requesting…":"Request CAN operating authorization"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        This proposal includes admissions and academic records because students
        need both to progress from family application into classes and official results.
        Requests do not activate your school or authorize staff to serve students.
      </p>
    </div>}
  </section>;
}
