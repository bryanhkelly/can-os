import {chromaticWidthModes} from "../../../.storybook/viewports";
import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {BrandTheme} from "@/design-system/brand-theme";
import {WorkspaceShell} from "./workspace-shell";
import {WorkspacePanel,StatusBadge} from "./workspace-panel";
import {FormSection} from "./form-page";
import {ActionFooter} from "./action-footer";
import {LocalDateTimeField} from "./local-datetime-field";
import {RecordFacts} from "./record-layout";
import {WorkspaceNotice} from "./notice";
const meta={title:"05 Page layouts/Branded, scheduling and settings",parameters:{chromatic:{modes: chromaticWidthModes([390,768,1024,1440])}}} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;

/** Public fixture is a presentation reference, not the server-rendered Site HTML. */
function PublicFixture(){
 const [email,setEmail]=useState("");
 const [submitted,setSubmitted]=useState(false);
 return <BrandTheme brand={{primary:"#075b50",primaryForeground:"#ffffff",accent:"#e5f4f0",accentForeground:"#102a26"}}>
  <header className="border-b bg-card p-4"><p className="font-semibold">Example Community Learning Center</p></header>
  <WorkspaceShell title="Digital skills workshop" eyebrow="Community programs" subtitle="Explore a four-session introductory experience." width="reading">
   <WorkspacePanel title="Express interest" description="This is an illustrative public journey. No real information is submitted." className="mt-6">
    {submitted?<WorkspaceNotice tone="success">Example interest received. No enrollment was created.</WorkspaceNotice>:
    <form onSubmit={event=>{event.preventDefault();setSubmitted(true);}}>
      <FormSection title="Your contact" columns={1}><Field label="Email address"><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field></FormSection>
      <ActionFooter layout="form"><Button type="submit" disabled={!email.trim()}>Express interest</Button></ActionFooter>
    </form>}
   </WorkspacePanel>
  </WorkspaceShell>
 </BrandTheme>;
}
export const PublicRegistration:Story={render:()=> <PublicFixture/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByRole("button",{name:"Express interest"})).toBeDisabled();
 await userEvent.type(c.getByRole("textbox",{name:"Email address"}),"example@example.com");
 await userEvent.click(c.getByRole("button",{name:"Express interest"}));
 await expect(c.getByText("Example interest received. No enrollment was created.")).toBeVisible();
}};
function ScheduleFixture(){
 const [time,setTime]=useState("2027-01-15T09:00");
 return <WorkspaceShell title="Calendar and scheduling" eyebrow="Site operations" width="wide" rail={<WorkspacePanel title="Selected day"><RecordFacts columns={1} items={[{label:"Timezone",value:"America/Chicago"},{label:"Available sessions",value:"2"}]}/></WorkspacePanel>}>
  <WorkspacePanel title="Day agenda" className="mt-6"><ul className="divide-y"><li className="py-3">9:00 AM · Digital skills workshop</li><li className="py-3">11:00 AM · Facilitator orientation</li></ul></WorkspacePanel>
  <WorkspacePanel title="Schedule a session" className="mt-4"><LocalDateTimeField label="Start" timezone="America/Chicago" value={time} onChange={setTime}/><p className="mt-3 text-sm text-muted-foreground">Selected local start: {time || "Not set"}</p></WorkspacePanel>
 </WorkspaceShell>;
}
export const Scheduling:Story={render:()=> <ScheduleFixture/>};
export const Administration:Story={render:()=> <WorkspaceShell title="Organization settings" eyebrow="Administration" width="wide" rail={<WorkspacePanel title="Access"><StatusBadge tone="info">Authorized operator fixture</StatusBadge></WorkspacePanel>}>
 <WorkspacePanel title="Sender configuration" className="mt-6"><RecordFacts items={[{label:"Sender identity",value:"Not configured"},{label:"Delivery webhook",value:"Not verified"}]}/><WorkspaceNotice tone="attention" className="mt-4">An authorized administrator must configure sending before campaigns can be queued.</WorkspaceNotice></WorkspacePanel>
 <WorkspacePanel title="Permissions" className="mt-4"><RecordFacts items={[{label:"Role",value:"Site operator"},{label:"Scope",value:"Example Site only"}]}/></WorkspacePanel>
 </WorkspaceShell>};
