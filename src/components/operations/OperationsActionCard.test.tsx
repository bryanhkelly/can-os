import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperationsActionCard, type OperationsActionItem } from "./OperationsActionCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));

const action={
  id:"action-1",kind:"task",type:"operational_followup",
  title:"Review opening evidence",detail:"School authority must independently approve",
  priority:"high",status:"open",siteId:"site-1",programId:"program-1",
  dueAt:null,ownerPersonId:null,openingHandoff:false,managedBySupport:false,
} as unknown as OperationsActionItem;

const base={
  i:action,selected:{siteId:"site-1",programId:"program-1"},
  assignees:[],commandsBlocked:false,dueDraft:"",hasDueDraft:false,
  onAssign:()=>{},onDueChange:()=>{},onSaveDue:()=>{},
  onChangeStatus:()=>{},onCompleteEnrollmentExit:()=>{},
};
describe("shared operations action card", () => {
  it("preserves work queue metadata and disables unsaved due dates", () => {
    const html=renderToStaticMarkup(<OperationsActionCard {...base}/>);
    expect(html).toContain("Review opening evidence");
    expect(html).toContain("Status: open");
    expect(html).toContain("Unassigned");
    expect(html).toContain("Save due date");
    expect(html).toContain("disabled");
  });
  it("routes supported confidential family review to its verified workspace", () => {
    const html=renderToStaticMarkup(<OperationsActionCard {...base}
      i={{...action,type:"guardian_health_information_review"} as OperationsActionItem}/>);
    expect(html).toContain("Review confidential family update");
    expect(html).not.toContain("Complete official withdrawal");
  });
  it("does not expose generic action mutations for support-owned referrals", () => {
    const html=renderToStaticMarkup(<OperationsActionCard {...base}
      i={{...action,managedBySupport:true} as OperationsActionItem}/>);
    expect(html).toContain("Managed by the support team");
    expect(html).not.toContain("Save due date");
  });
});
