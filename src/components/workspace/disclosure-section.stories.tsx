import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisclosureSection } from "./disclosure-section";
import { Input } from "@/components/ui/input";
import { expect, fn, userEvent, within } from "storybook/test";

const meta = { id: "v6-1-foundations-disclosure-section", title: "03 Components/Disclosure section",
  component:DisclosureSection, parameters:{layout:"padded"} } satisfies Meta<typeof DisclosureSection>;
export default meta;
type Story=StoryObj<typeof meta>;
export const IndependentPanels:Story={args:{title:"Colors",children:null},render:()=>{
  const Example=()=>{const [value,setValue]=useState("Your School");
    return <div className="max-w-2xl space-y-3 bg-background p-5">
      <DisclosureSection title="Colors" description="Change a maintained palette" defaultOpen>
        <p className="text-sm">Use the approved palette catalog.</p>
      </DisclosureSection>
      <DisclosureSection title="Typography" description="Fonts preview as rendered" defaultOpen>
        <Input aria-label="Sample brand text" value={value} onChange={event=>setValue(event.target.value)}/>
      </DisclosureSection>
      <DisclosureSection title="Wordmark & Logo"><p className="text-sm">Optional logo settings</p></DisclosureSection>
      <DisclosureSection title="Imagery"><p className="text-sm">Rights-cleared Site artwork</p></DisclosureSection>
    </div>};
  return <Example/>;
}};

export const UncontrolledObserver:Story={
  args:{title:"Evidence details",children:<p>Source and counting rule</p>,onOpenChange:fn(),headingLevel:"h4"},
  play:async({canvasElement,args})=>{
    const canvas=within(canvasElement);
    const trigger=canvas.getByRole("button",{name:"Evidence details"});
    await expect(canvas.getByRole("heading",{level:4,name:"Evidence details"})).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded","false");
    const panelId=trigger.getAttribute("aria-controls");
    const panel=canvasElement.ownerDocument.getElementById(panelId!);
    await expect(panel).not.toBeVisible();
    trigger.focus();
    await userEvent.keyboard("[Enter]");
    await expect(trigger).toHaveAttribute("aria-expanded","true");
    await expect(panel).toBeVisible();
    await expect(args.onOpenChange).toHaveBeenCalledWith(true);
    await userEvent.keyboard("[Space]");
    await expect(panel).not.toBeVisible();
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};
export const RetainsEditorState:Story={
  args:{title:"Optional content",children:<Input aria-label="Optional content text" defaultValue="Initial draft"/>},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const trigger=canvas.getByRole("button",{name:"Optional content"});
    await userEvent.click(trigger);
    const input=canvas.getByRole("textbox",{name:"Optional content text"});
    await userEvent.clear(input);
    await userEvent.type(input,"Updated draft");
    await userEvent.click(trigger);
    await expect(input).not.toBeVisible();
    await userEvent.click(trigger);
    await expect(input).toHaveValue("Updated draft");
  },
};
