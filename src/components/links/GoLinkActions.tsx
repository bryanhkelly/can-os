import { Button } from "@/components/ui/button";
import { CopyLinkButton } from "./CopyLinkButton";
import { GoLinkQrButton } from "./GoLinkQrButton";
import type { GoLinkStatus } from "@/domain/go-link-policy";

import { GoLinkLifecycleActions, type GoLinkAction } from "./GoLinkLifecycleActions";
export type { GoLinkAction } from "./GoLinkLifecycleActions";
export type GoLinkActionsProps={
  code:string;
  status:GoLinkStatus;
  busy?:boolean;
  onTest?:()=>void;
  onShow?:()=>void;
  onChange?:(action:GoLinkAction)=>void;
};
/** Composes governed link distribution controls without owning Site scope.
 * Each surface supplies its authorized server command, never a generic URL. */
export function GoLinkActions({code,status,busy=false,onTest,onShow,onChange}:GoLinkActionsProps){
  return <div className="flex flex-wrap gap-2" role="group" aria-label="Go Link actions">
    {status!=="revoked"&&<>
      <CopyLinkButton key={code} destination={{kind:"go",code}} disabled={busy}/>
      <GoLinkQrButton key={"qr-"+code} code={code} disabled={busy}/>
      {onShow&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={onShow}>Show link</Button>}
    </>}
    <GoLinkLifecycleActions status={status} busy={busy} onTest={onTest} onChange={onChange}/>
  </div>;
}
