import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import {FileSelectionField,UploadedFileNotice} from "./file-selection-field";
import {WorkspaceShell} from "./workspace-shell";
const meta={title:"03 Components/File selection"} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
function Fixture({disabled=false}:{disabled?:boolean}){
 const [file,setFile]=useState<File|null>(null);
 return <WorkspaceShell title="Select a private document"><FileSelectionField label="Choose document" accept="application/pdf" file={file} onChange={setFile} disabled={disabled}/></WorkspaceShell>;
}
export const SelectAndClear:Story={render:()=> <Fixture/>,play:async({canvasElement})=>{
 const c=within(canvasElement);const input=c.getByLabelText("Choose document") as HTMLInputElement;
 await userEvent.upload(input,new File(["fixture"],"example.pdf",{type:"application/pdf"}));
 await expect(c.getByText(/Selected: example.pdf/)).toBeVisible();
 await userEvent.click(c.getByRole("button",{name:"Clear file"}));
 await expect(input.value).toBe("");await expect(c.queryByText(/Selected: example.pdf/)).not.toBeInTheDocument();
}};
export const Disabled:Story={render:()=> <Fixture disabled/>};
export const AwaitingFinalization:Story={render:()=> <WorkspaceShell title="File recorded in storage"><UploadedFileNotice/></WorkspaceShell>};
