import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent,fn} from "storybook/test";
import {GroupMembershipRequestRow,GroupModerationReportRow} from "./GroupReviewRows";
import type {StudyGroupRecord} from "@/domain/study-group-display";
const member={id:"fixture",studentName:"Example learner",studentPersonId:"person-fixture",guardianReady:false} as StudyGroupRecord["pendingMembers"][number];
const report={id:"fixture-report",reason:"Reported content",postBody:"Example reported text.",postHidden:false} as StudyGroupRecord["reports"][number];
const meta={title:"08 Feature workspaces/Group review",decorators:[Story=><div className="p-5"><Story/></div>]} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
export const PermissionRequired:Story={render:()=> <GroupMembershipRequestRow member={member} groupId="fixture" busy={false} membershipEnabled onDecision={()=>{}}/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByRole("button",{name:"Approve"})).toBeDisabled();await expect(c.getByText("Approval requires recorded guardian permission.")).toBeVisible();
}};
const decision=fn();
export const Moderation:Story={render:()=> <GroupModerationReportRow report={report} groupId="fixture" busy={false} moderationEnabled onResolve={decision}/>,play:async({canvasElement})=>{
 await userEvent.click(within(canvasElement).getByRole("button",{name:"Retain post"}));await expect(decision).toHaveBeenCalledWith("fixture-report",false);
}};
export const ReadOnly:Story={render:()=> <GroupModerationReportRow report={report} groupId="fixture" busy={false} moderationEnabled={false} onResolve={()=>{}}/>};
