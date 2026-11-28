import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import type {NativePublisherReleaseRecord} from "@/domain/native-publisher-release-readiness";
import {PlatformReleaseCenter} from "./PlatformReleaseCenter";
import {WorkspaceShell} from "@/components/workspace/workspace-shell";
const base:NativePublisherReleaseRecord={offeringVersionId:"fixture-1",offeringTitle:"Community digital skills",versionNo:1,lifecycle:"draft",courseCount:1,publishedCourses:0,creatorMemberships:1,reviewerMemberships:1,creatorAppointedCourses:1,reviewerAppointedCourses:1,currentEvidenceRecords:1,releasePolicies:0,manifestStatus:null,releaseAssets:0,approvedAdoptions:0};
const records=[base,{...base,offeringVersionId:"fixture-2",offeringTitle:"Volunteer orientation",courseCount:0}];
const meta={title:"08 Feature workspaces/Platform release center"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
export const LimitedInventory:Story={render:()=> <WorkspaceShell title="Platform operations"><PlatformReleaseCenter records={records} limited/></WorkspaceShell>,play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText(/More than 25 versions exist/)).toBeVisible();
 await expect(c.getByText("2 shown")).toBeVisible();await userEvent.type(c.getByRole("searchbox",{name:"Filter Offering versions"}),"Volunteer");
 await expect(c.getByText("1 shown")).toBeVisible();await expect(c.queryByText("Community digital skills")).not.toBeInTheDocument();
 await expect(c.getByRole("link",{name:/Open Course authoring/})).toHaveAttribute("href","/class?view=content");
}};
export const Empty:Story={render:()=> <WorkspaceShell title="Platform operations"><PlatformReleaseCenter records={[]} limited={false}/></WorkspaceShell>};
