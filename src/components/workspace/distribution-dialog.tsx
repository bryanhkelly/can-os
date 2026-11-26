import {useId,type ReactNode} from "react";
import {X} from "lucide-react";
import {Modal} from "@/components/ui/modal";
import {Button} from "@/components/ui/button";
/** Shared presentation for distribution workflows. The feature owns the
 * link eligibility, approved origin, expiry, commands and consent. */
export function DistributionDialog({open,onClose,title,description,busy=false,children}:{
  open:boolean;onClose:()=>void;title:string;description:string;busy?:boolean;children:ReactNode;
}){
  const heading=useId(),summary=useId();
  return <Modal open={open} onClose={onClose} label={title} labelledBy={heading} describedBy={summary}
    busy={busy} dismissible={!busy} className="max-w-2xl">
    <div className="flex min-w-0 items-start justify-between gap-4 border-b p-5">
      <div className="min-w-0"><h2 id={heading} className="font-serif text-xl">{title}</h2>
        <p id={summary} className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>
      <Button size="sm" variant="ghost" aria-label="Close sharing" disabled={busy} onClick={onClose}><X aria-hidden="true" className="size-5"/></Button>
    </div>
    <div className="min-w-0 space-y-5 p-5">{children}</div>
  </Modal>;
}
