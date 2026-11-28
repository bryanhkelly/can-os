import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {PublicInterestTimeline} from "./PublicInterestTimeline";
import type {PublicInterestRecord} from "./PublicInterestRecordCard";
import {WorkspaceShell} from "@/components/workspace/workspace-shell";
import {WorkspacePanel} from "@/components/workspace/workspace-panel";
const row={id:"interest-fixture",siteId:"site-fixture",programId:"program-fixture",createdAt:"2026-11-10T20:00:00Z",consentAt:null,contactedAt:null,admissionsAuthorizationStatus:"authorized",admissionsAuthorized:true,applicationId:null,activeEnrollment:false,placedInClass:false} as unknown as PublicInterestRecord;
const meta={title:"08 Feature workspaces/Admissions/Interest evidence timeline",component:PublicInterestTimeline,args:{row},
 decorators:[Story=><WorkspaceShell title="Family inquiry evidence"><WorkspacePanel title="Relationship history"><Story/></WorkspacePanel></WorkspaceShell>]} satisfies Meta<typeof PublicInterestTimeline>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Inquiry:Story={};
export const VerifiedEmailIsNotEnrollment:Story={args:{row:{...row,familyStartRequestId:"fixture-start",emailVerifiedAt:"2026-11-12T20:00:00Z",applicationId:"fixture-application",applicationStage:"inquiry"}},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText(/Family verified email link.*not guardianship/)).toBeVisible();
 await expect(c.getByText("School-year enrollment not yet active")).toBeVisible();
 await expect(c.queryByText("School-year enrollment activated")).not.toBeInTheDocument();
}};
export const AuthorizationUnavailable:Story={args:{row:{...row,admissionsAuthorizationStatus:"temporarily_unavailable",admissionsAuthorized:false}},play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("Admissions authorization could not be checked. Refresh before taking action.")).toBeVisible();
 await expect(c.queryByText("CAN admissions and school-of-record services authorized")).not.toBeInTheDocument();
}};
