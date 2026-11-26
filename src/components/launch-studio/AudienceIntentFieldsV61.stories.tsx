import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell, ActionFooter, WorkspaceNotice } from "@/components/workspace";
import { GuidedSetupShell } from "@/components/workflow";
import { sitePlanningAudienceIds, type SitePlanningAudienceId } from "@/domain/site-audiences";
import { AudienceIntentFieldsV61 } from "./AudienceIntentFieldsV61";
import { SiteGuideV61 } from "./SiteGuideV61";

const meta = { id: "launch-studio-shape-audiences", title: "08 Feature workspaces/Launch Studio/Shape/Audiences", parameters:{layout:"fullscreen"} } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const typical: SitePlanningAudienceId[] = ["children","adults","older_adults","immigrants","english_language_learners","homelessness"];

function Review({initial=[],disabled=false,error=false}:{
  initial?: readonly SitePlanningAudienceId[]; disabled?:boolean; error?:boolean;
}) {
  const [selected,setSelected]=useState([...initial]);
  return <WorkspaceShell width="wide" title="Programs & Audiences" eyebrow="Shape / Programs & Audiences"
    subtitle="Explore what you want to offer, who you desire to serve and the experiences that bring your vision to life."
    rail={<SiteGuideV61 guide={{summary:"Your declared desire can guide future partnerships.",next:"Choose the experiences that bring your vision to life."}}/>}>
    <GuidedSetupShell title="Who do you desire to serve?"
      description="Identify the people and communities you have a heart to serve, even if you do not currently have the programs or resources to reach them."
      steps={[
        {id:"interests",title:"Programs",description:"What you want to offer",status:"upcoming"},
        {id:"audiences",title:"Audiences",description:"Who you desire to serve",status:"current"},
        {id:"experiences",title:"Experiences",description:"What people could learn, do or enjoy",status:"upcoming"},
      ]}>
      <AudienceIntentFieldsV61 selected={selected} disabled={disabled}
        onChange={(id,checked)=>setSelected(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id))}/>
    </GuidedSetupShell>
    {error&&<div className="mt-4"><WorkspaceNotice tone="danger">Your choices could not be saved. Review and retry.</WorkspaceNotice></div>}
    <ActionFooter layout="step">
      <Button variant="outline" disabled><ArrowLeft/>Previous step</Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled>Save &amp; Exit</Button>
        <Button disabled>Continue to Experiences<ArrowRight/></Button>
      </div>
    </ActionFooter>
    <p className="mt-2 text-xs text-muted-foreground">Offline review: navigation and persistence are intentionally disabled.</p>
  </WorkspaceShell>;
}
export const Empty: Story={render:()=> <Review/>};
export const Typical: Story={
  render:()=> <Review initial={typical}/>,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const refugees=canvas.getByRole("button",{name:/^Refugees$/});
    await expect(refugees).toHaveAttribute("aria-pressed","false");
    await userEvent.click(refugees);
    await expect(refugees).toHaveAttribute("aria-pressed","true");
    await expect(canvas.getByRole("status")).toHaveTextContent("7 selected");
  },
};
export const AllAudiences: Story={render:()=> <Review initial={sitePlanningAudienceIds}/>};
export const Saving: Story={render:()=> <Review initial={typical} disabled/>};
export const SaveError: Story={render:()=> <Review initial={typical} error/>};
