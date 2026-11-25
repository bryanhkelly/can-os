import { Button } from "@/components/ui/button";
import { ActionFooter } from "@/components/workspace/action-footer";
export type AdmissionsDecision="application"|"eligibility"|"accept"|"decline"|"withdraw"|"waitlist"|"restore";

const actions:Record<string,readonly (readonly [AdmissionsDecision,string])[]>={
 inquiry:[["application","Start application"],["decline","Decline"],["withdraw","Withdraw"]],
 application:[["eligibility","Begin eligibility review"],["decline","Decline"],["withdraw","Withdraw"]],
 eligibility:[["accept","Approve for offer"],["waitlist","Waitlist"],["decline","Decline"],["withdraw","Withdraw"]],
 waitlisted:[["restore","Restore to review"],["decline","Decline"],["withdraw","Withdraw"]],
 ready_for_offer:[["waitlist","Waitlist"],["decline","Decline"],["withdraw","Withdraw"]],
};

/** Presentational decisions; the canonical server command owns every transition rule. */
export function AdmissionsDecisionActions({stage,disposition,busy,onDecision}:{
 stage:string;disposition?:string|null;busy:boolean;
 onDecision:(decision:AdmissionsDecision,label:string)=>void;
}){
 const key=stage==="eligibility"&&(disposition==="waitlisted"||disposition==="ready_for_offer")
  ?disposition:stage;
 const options=actions[key]??[];
 if(!options.length)return null;
 return <ActionFooter layout="inline">
  {options.map(([decision,label])=><Button key={decision} type="button" variant="outline" size="sm" disabled={busy}
   onClick={()=>onDecision(decision,label)}
   >{label}</Button>)}
 </ActionFooter>;
}
