import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisclosureSection } from "./disclosure-section";
import { Input } from "@/components/ui/input";

const meta = { title:"V6.1 foundations/Disclosure section",
  component:DisclosureSection, parameters:{layout:"padded"} } satisfies Meta<typeof DisclosureSection>;
export default meta;
type Story=StoryObj<typeof meta>;
export const IndependentPanels:Story={render:()=>{
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
