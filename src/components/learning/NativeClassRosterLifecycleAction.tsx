import { useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import { cancelNativeClassEnrollment } from
  "@/modules/classes/native-class-lifecycle.functions";

type Props={
  classEnrollmentId:string;
  status:"pending"|"active";
  onChanged:()=>Promise<void>;
};

/** Registrar action, not a Site-wide browser authorization shortcut.
 * The command independently revalidates the exact staff session, Class,
 * owning Organization and Site immediately before changing participation. */
export function NativeClassRosterLifecycleAction({
  classEnrollmentId,status,onChanged,
}:Props){
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function cancel(){
    if(!confirm||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await cancelNativeClassEnrollment({data:{
        classEnrollmentId,
        reason:status==="pending"?"not_eligible":"operator_decision",
      }});
      setConfirm(false);
      setMessage(status==="pending"?"Request rejected.":"Enrollment cancelled.");
      await onChanged();
    }catch(e){setError(normalizeClientError(e,"Unable to change participation.").message);}
    finally{setBusy(false);}
  }
  return <div className="flex flex-col items-end gap-2">
    {confirm?<div className="border border-border bg-muted/20 p-3 text-sm">
      <p>Confirm {status==="pending"?"rejection":"cancellation"}?
        This releases the seat and preserves prior learning evidence.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={()=>void cancel()}>
          {busy?"Saving…":"Confirm"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy}
          onClick={()=>setConfirm(false)}>Keep enrollment</Button>
      </div>
    </div>:<Button type="button" size="sm" variant="outline"
      onClick={()=>setConfirm(true)}>
      {status==="pending"?"Reject request":"Cancel enrollment"}
    </Button>}
    {message&&<p role="status" className="text-sm">{message}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
