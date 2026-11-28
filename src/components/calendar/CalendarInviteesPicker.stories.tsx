import {useState,type ComponentProps} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {CalendarInviteesPicker} from "./CalendarInviteesPicker";
type Props=ComponentProps<typeof CalendarInviteesPicker>;
const contacts=[{personId:"person-a",name:"Example Teacher",label:"School staff"},{personId:"person-b",name:"Example Guardian",label:"Family"}] as Props["inviteContacts"];
const groups=[{id:"group-a",title:"Workshop team",kind:"class",members:[{personId:"person-a",name:"Example Teacher"}]}] as Props["inviteGroups"];
function Fixture({loading=false,error=""}:{loading?:boolean;error?:string}){
 const [query,setQuery]=useState(""),[groupIds,setGroupIds]=useState<string[]>([]),[people,setPeople]=useState<string[]>([]);
 return <div className="p-5"><CalendarInviteesPicker inviteGroups={groups} inviteContacts={contacts} inviteGroupsError="" inviteContactsError={error} loading={loading}
 inviteSearch={query} setInviteSearch={setQuery} inviteGroupIds={groupIds} setInviteGroupIds={setGroupIds} inviteePersonIds={people} setInviteePersonIds={setPeople}/></div>;
}
const meta={title:"08 Feature workspaces/Calendar invitees",component:Fixture} satisfies Meta<typeof Fixture>;
export default meta;
type Story=StoryObj<typeof meta>;
export const DeduplicatedGuests:Story={play:async({canvasElement})=>{
 const c=within(canvasElement);
 await userEvent.click(c.getByRole("checkbox",{name:/Workshop team/}));
 await userEvent.click(c.getByRole("checkbox",{name:/Example Teacher/}));
 await expect(c.getByText("1 selected",{exact:true})).toBeVisible();
 await userEvent.type(c.getByRole("searchbox",{name:"Search the Global Address List"}),"Guardian");
 await userEvent.click(c.getByRole("checkbox",{name:/Example Guardian/}));
 await expect(c.getByText("2 selected",{exact:true})).toBeVisible();
}};
export const Loading:Story={args:{loading:true}};
export const ReadError:Story={args:{error:"Authorized contacts could not be loaded."}};
