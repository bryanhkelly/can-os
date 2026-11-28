import type {Meta,StoryObj} from "@storybook/react-vite";
import {useState} from "react";
import {expect,userEvent,within} from "storybook/test";
import {ReportingRelationshipPanel,type ReportingRelationshipPanelProps} from "./ReportingRelationshipPanel";
import type {ReportingRelationship} from "@/domain/bottom-up-reporting-relationships";
const id=(n:number)=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const scope={scopeKind:"offering",scopeId:id(1)} as const;
const recipient={id:id(2),name:"Example community foundation"};
const metric={metricKey:"class.registrations",definitionVersion:"1.0.0",label:"Registrations"};
const sample:ReportingRelationship={...scope,id:id(3),recipientOrganizationId:recipient.id,
  ownerOrganizationId:id(4),relationshipKind:"funding",metrics:[{metricKey:metric.metricKey,definitionVersion:metric.definitionVersion}],
  validThrough:null,proposedByPersonId:id(5),proposedAt:"2026-11-24T09:00:00Z",status:"pending",
  acceptedAt:null,acceptedByPersonId:null};
const meta={id: "v6-1-reporting-organization-relationships", title: "08 Feature workspaces/Reporting/Organization relationships",component:ReportingRelationshipPanel} satisfies Meta<typeof ReportingRelationshipPanel>;
export default meta;
type Story=StoryObj<typeof meta>;
const common:ReportingRelationshipPanelProps={scope,entries:[],recipients:[recipient],metrics:[metric],
  canPropose:true,onPropose:()=>{},onAction:()=>{}};
function ProposalPreview(){
  const [submitted,setSubmitted]=useState(false);
  return <div className="max-w-xl space-y-3">
    <ReportingRelationshipPanel {...common} onPropose={()=>setSubmitted(true)}/>
    {submitted&&<p role="status">Preview request submitted. No live data changed.</p>}
  </div>;
}
export const Proposal:Story={args:common,render:()=> <ProposalPreview/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  const submit=canvas.getByRole("button",{name:"Request relationship"});
  await expect(submit).toBeDisabled();
  await userEvent.selectOptions(canvas.getByRole("combobox",{name:/^Organization\s*\(required\)$/}),recipient.id);
  await userEvent.click(canvas.getByRole("checkbox",{name:"Registrations"}));
  await expect(submit).toBeEnabled();
  await userEvent.click(submit);
  await expect(canvas.getByText("Preview request submitted. No live data changed.")).toBeVisible();
}};
function AcceptancePreview(){
  const [accepted,setAccepted]=useState(false);
  return <ReportingRelationshipPanel {...common} canPropose={false}
    entries={[{agreement:accepted?{...sample,status:"accepted",acceptedAt:"2026-11-24T10:00:00Z",acceptedByPersonId:id(6)}:sample,
      organizationName:"Example local learning center",metricLabels:[metric.label],
      allowedActions:accepted?[]:["accept","decline"]}]}
    onAction={(_id,action)=>{if(action==="accept")setAccepted(true);}}/>;
}
export const Incoming:Story={args:common,render:()=> <AcceptancePreview/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole("button",{name:"Accept relationship"}));
  await userEvent.click(canvas.getByRole("button",{name:/^Confirm$/}));
  await expect(canvas.getByText("accepted",{exact:true})).toBeVisible();
}};

export const TagOnly:Story={args:common,render:()=> <ProposalPreview/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  const submit=canvas.getByRole("button",{name:"Request relationship"});
  await expect(submit).toBeDisabled();
  await userEvent.selectOptions(canvas.getByRole("combobox",{name:/^Organization\s*\(required\)$/}),recipient.id);
  await expect(submit).toBeEnabled();
  await userEvent.click(submit);
  await expect(canvas.getByText("Preview request submitted. No live data changed.")).toBeVisible();
}};
