import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {EntityPicker} from "./entity-picker";
import {WorkspaceShell} from "./workspace-shell";
const meta={title:"03 Components/Entity picker"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
const options=[{id:"a",label:"Community Center A",detail:"Site"},{id:"b",label:"Community Center B",detail:"Site"},{id:"c",label:"Unavailable Site",disabled:true}];
function Fixture(){
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState<readonly string[]>([]);
 return <WorkspaceShell title="Select Sites"><EntityPicker label="Sites" multiple options={options.filter(o=>o.label.toLowerCase().includes(query.toLowerCase()))} query={query} onQueryChange={setQuery} selected={selected} onChange={setSelected}/></WorkspaceShell>;
}
export const MultipleSelection:Story={render:()=> <Fixture/>,play:async({canvasElement})=>{
 const c=within(canvasElement);await userEvent.click(c.getByRole("checkbox",{name:/Community Center A/}));await expect(c.getByText("1 selected")).toBeVisible();
 await userEvent.type(c.getByRole("searchbox",{name:"Search sites"}),"Center B");
 await userEvent.click(c.getByRole("checkbox",{name:/Community Center B/}));await expect(c.getByText("2 selected")).toBeVisible();
 await userEvent.clear(c.getByRole("searchbox",{name:"Search sites"}));await expect(c.getByRole("checkbox",{name:/Unavailable Site/})).toBeDisabled();
}};
