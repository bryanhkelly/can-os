import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {FamilyReadinessOverviewCard,type FamilyReadinessOverview} from "./FamilyReadinessOverviewCard";
import {WorkspaceShell} from "@/components/workspace/workspace-shell";
import {WorkspacePanel} from "@/components/workspace/workspace-panel";
const application:FamilyReadinessOverview={program:"Example school program",stage:"Admissions review",journeyStatus:"in_progress",activeSchoolYears:[],offers:[],readiness:{completed:2,total:4,blockers:2}};
const meta={title:"07 Persona experiences/Family/Admissions readiness",component:FamilyReadinessOverviewCard,args:{application},
 decorators:[Story=><WorkspaceShell title="Family admissions"><WorkspacePanel title="Your learner"><Story/></WorkspacePanel></WorkspaceShell>]} satisfies Meta<typeof FamilyReadinessOverviewCard>;
export default meta;
type Story=StoryObj<typeof meta>;
export const BlockingRequirements:Story={};
export const Offered:Story={args:{application:{...application,offers:[{status:"issued",schoolYearId:"fixture-year"}]}}};
export const AcceptedAwaitingActivation:Story={args:{application:{...application,readiness:{completed:4,total:4,blockers:0},offers:[{status:"accepted",schoolYearId:"fixture-year"}]}},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("Registrar activation pending")).toBeVisible();await expect(c.getByText("Not active",{exact:true})).toBeVisible();
}};
export const ActiveEnrollment:Story={args:{application:{...application,activeSchoolYears:[{id:"fixture-year"}],offers:[{status:"accepted",schoolYearId:"fixture-year"}],readiness:{completed:4,total:4,blockers:0}}},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("Active",{exact:true})).toBeVisible();await expect(c.getByText("Active school-year records: 1")).toBeVisible();
}};
