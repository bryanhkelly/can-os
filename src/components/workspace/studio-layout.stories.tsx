import type {Meta,StoryObj} from "@storybook/react-vite";
import {useState} from "react";
import {expect,within,userEvent} from "storybook/test";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {StudioLayout} from "./studio-layout";
import {WorkspaceShell} from "./workspace-shell";
const meta={title:"05 Page layouts/Builder studio"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
function Builder(){
 const [section,setSection]=useState("Home");
 const [names,setNames]=useState<Record<string,string>>({Home:"Welcome to our center",Programs:"Explore our programs"});
 return <WorkspaceShell title="Website content" width="wide"><StudioLayout
  navigation={<div className="space-y-2">{["Home","Programs"].map(name=><Button key={name} variant={section===name?"secondary":"ghost"} aria-current={section===name?"page":undefined} onClick={()=>setSection(name)}>{name}</Button>)}</div>}
  canvas={<Field label={section+" heading"}><Input value={names[section]} onChange={e=>setNames(prev=>({...prev,[section]:e.target.value}))}/></Field>}
  inspector={<><h2 className="font-semibold">Preview</h2><p className="mt-3 break-words">{names[section]}</p></>}
  footer={<p className="text-sm text-muted-foreground">Storybook fixture. Changes are not persisted.</p>}/></WorkspaceShell>;
}
export const Editable:Story={render:()=> <Builder/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await userEvent.click(c.getByRole("button",{name:"Programs"}));
 const input=c.getByRole("textbox",{name:"Programs heading"});await userEvent.clear(input);await userEvent.type(input,"Community programs");
 await expect(c.getByText("Community programs",{exact:true})).toBeVisible();
}};
