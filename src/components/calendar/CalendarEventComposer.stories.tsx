import {useRef,useState,type ComponentProps} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {WorkspaceShell} from "@/components/workspace/workspace-shell";
import {WorkspaceNotice} from "@/components/workspace/notice";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {countCalendarInvitees} from "@/domain/calendar-invitees";
import {CalendarEventComposer,type CalendarComposerFields} from "./CalendarEventComposer";

type Invitees=ComponentProps<typeof CalendarEventComposer>["invitees"];
function Fixture({limit=false}:{limit?:boolean}){
 const [open,setOpen]=useState(false),[attempted,setAttempted]=useState(false),[saved,setSaved]=useState(false);
 const [form,setForm]=useState<CalendarComposerFields>({title:"",description:"",date:"2027-01-15",start:"09:00",end:"10:00",timezone:"America/Chicago"});
 const contacts=Array.from({length:limit?101:2},(_,i)=>({personId:"fixture-person-"+i,name:"Example participant "+(i+1),label:"Synthetic Site member"})) as Invitees["inviteContacts"];
 const [people,setPeople]=useState<string[]>(()=>limit?contacts.map(row=>row.personId):[]);
 const [groups,setGroups]=useState<string[]>([]),[search,setSearch]=useState("");
 const focus=useRef<HTMLInputElement>(null);
 const mutation=useMutationFeedback(async()=>({ok:true}));
 const inviteGroups:Invitees["inviteGroups"]=[];
 const count=countCalendarInvitees(inviteGroups,groups,people);
 return <WorkspaceShell title="Calendar event workspace" subtitle="Local fixture only. No calendar event or invitation is created.">
  <Button onClick={()=>{setAttempted(false);setOpen(true);}}>New event</Button>
  {saved&&<WorkspaceNotice tone="success" className="mt-4">Fixture event prepared for {count} guests. No invitations sent.</WorkspaceNotice>}
  <CalendarEventComposer open={open} busy={false} attempted={attempted} error="" mutation={mutation}
   initialFocus={focus} form={form} selectedInviteeCount={count} inviteGroupCount={groups.length}
   invitees={{inviteGroups,inviteContacts:contacts,inviteContactsError:"",inviteGroupsError:"",loading:false,inviteSearch:search,setInviteSearch:setSearch,inviteGroupIds:groups,setInviteGroupIds:setGroups,inviteePersonIds:people,setInviteePersonIds:setPeople}}
   onClose={()=>setOpen(false)} onFieldChange={(field,value)=>setForm(current=>({...current,[field]:value}))}
   onSubmit={()=>{setAttempted(true);if(form.title.trim().length<3||!form.date||!form.start||(form.end&&form.end<=form.start)||count>100||groups.length>50)return;setSaved(true);setOpen(false);}}/>
 </WorkspaceShell>;
}
const meta={title:"08 Feature workspaces/Calendar/Event composer",component:Fixture,tags:["critical","responsive"]} satisfies Meta<typeof Fixture>;
export default meta;
type Story=StoryObj<typeof meta>;
export const CreateAndValidate:Story={play:async({canvasElement})=>{
 const c=within(canvasElement),trigger=c.getByRole("button",{name:"New event"});
 await userEvent.click(trigger);const d=within(c.getByRole("dialog"));
 const title=d.getByRole("textbox",{name:/Title/});await expect(title).toHaveFocus();
 await userEvent.click(d.getByRole("button",{name:"Create event"}));
 await expect(d.getByText("Enter a title with at least 3 characters.")).toBeVisible();
 await userEvent.type(title,"Digital skills session");
 await userEvent.click(d.getByRole("checkbox",{name:/Example participant 1/}));
 await userEvent.click(d.getByRole("button",{name:"Create event"}));
 await expect(c.getByText("Fixture event prepared for 1 guests. No invitations sent.")).toBeVisible();
 await expect(trigger).toHaveFocus();
}};
export const InviteeLimit:Story={args:{limit:true},play:async({canvasElement})=>{
 const c=within(canvasElement);await userEvent.click(c.getByRole("button",{name:"New event"}));
 const d=within(c.getByRole("dialog"));await expect(d.getByText("Choose no more than 100 people.")).toBeVisible();
 await expect(d.getByRole("button",{name:"Create event"})).toBeDisabled();
}};
