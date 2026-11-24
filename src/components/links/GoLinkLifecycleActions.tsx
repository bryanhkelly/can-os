import { Button } from "@/components/ui/button";
import type { GoLinkStatus } from "@/domain/go-link-policy";

export type GoLinkAction="pause"|"resume"|"revoke";
export type GoLinkLifecycleActionsProps={
  status:GoLinkStatus;
  busy?:boolean;
  /** Some authorized command surfaces support revocation only. */
  allowPause?:boolean;
  onTest?:()=>void;
  onChange?:(action:GoLinkAction)=>void;
};
/** Presentation only. The caller authorizes, confirms and persists transitions. */
export function GoLinkLifecycleActions({status,busy=false,allowPause=true,onTest,onChange}:GoLinkLifecycleActionsProps){
  return <>
    {onTest&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={onTest}>Test link</Button>}
    {status!=="revoked"&&onChange&&<>
      {allowPause&&<Button type="button" size="sm" variant="outline" disabled={busy}
        onClick={()=>onChange(status==="paused"?"resume":"pause")}>{status==="paused"?"Resume":"Pause"}</Button>}
      <Button type="button" size="sm" variant="outline" disabled={busy}
        onClick={()=>onChange("revoke")}>Revoke</Button>
    </>}
  </>;
}
