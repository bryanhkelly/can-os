import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within} from "storybook/test";
import {NetworkReportingReadinessView,type NetworkReportingReadinessData} from "./NetworkReportingReadinessView";
const data={asOf:"2026-11-26T00:00:00Z",counts:{activeUnits:4,currentMemberships:9,currentGrants:3,currentGrantHosts:2},blockers:["Independent execution authorization required."]} as NetworkReportingReadinessData;
const meta={title:"08 Feature workspaces/Network reporting readiness",component:NetworkReportingReadinessView,args:{data},decorators:[Story=><div className="p-5"><Story/></div>]} satisfies Meta<typeof NetworkReportingReadinessView>;
export default meta;
type Story=StoryObj<typeof meta>;
export const ConfigurationOnly:Story={play:async({canvasElement})=>{
 const c=within(canvasElement);await expect(c.getByText("Current reporting units")).toBeVisible();await expect(c.getByText(/They are not learner outcomes/)).toBeVisible();await expect(c.getByText("Independent execution authorization required.")).toBeVisible();
}};
