import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { emptySiteProgramsAudiencesV61, type SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import { EstablishExperiencesV61, type ExperiencesStageV61 } from "./EstablishExperiencesV61";

const meta={title:"Launch Studio/Shape/Experiences",parameters:{layout:"fullscreen"}} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
const base:SiteProgramsAudiencesV61={...emptySiteProgramsAudiencesV61(),
  interestIds:["adult","senior"],audienceIds:["adults","older_adults","immigrants","english_language_learners","homelessness"]};
const five:SiteProgramsAudiencesV61={...base,
  experienceIds:["digital-confidence","languages-cultures","financial-literacy","career-skills","reading-literacy"]};

function Review({initial=base,initialStage="choose",disabled=false}:{
  initial?:SiteProgramsAudiencesV61;initialStage?:ExperiencesStageV61;disabled?:boolean;
}){
  const [draft,setDraft]=useState(initial);
  const [stage,setStage]=useState<ExperiencesStageV61>(initialStage);
  return <WorkspaceShell title="Programs & Audiences" eyebrow="Shape / Experiences" width="wide">
    <EstablishExperiencesV61 draft={draft} setDraft={setDraft} stage={stage} onStageChange={setStage}
      disabled={disabled} programCatalog={[]}/>
    <div className="mt-5 flex gap-2">
      <Button variant="outline" disabled={disabled||stage==="choose"} onClick={()=>setStage("choose")}>Explore topics</Button>
      <Button disabled={disabled||!(draft.experienceIds?.length)} onClick={()=>setStage("personalize")}>Personalize selections</Button>
    </div>
  </WorkspaceShell>;
}
export const Browse:Story={render:()=> <Review/>,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const topic=canvas.getByRole("button",{name:/^Languages & Culture/});
    await userEvent.click(topic);
    await expect(topic).toHaveAttribute("aria-pressed","true");
    await userEvent.click(canvas.getByRole("button",{name:"Personalize selections"}));
    await expect(canvas.getByText("Who is this for?")).toBeInTheDocument();
    const audience=canvas.getByRole("button",{name:/^English language learners$/});
    await userEvent.click(audience);
    await expect(audience).toHaveAttribute("aria-pressed","true");
  }
};
export const FiveSelected:Story={render:()=> <Review initial={five}/>,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole("button",{name:/^Robotics/})).toBeDisabled();
    await userEvent.click(canvas.getByRole("button",{name:"Remove Digital Confidence"}));
    await expect(canvas.getByRole("button",{name:/^Robotics/})).toBeEnabled();
  }
};
export const Personalize:Story={render:()=> <Review initial={five} initialStage="personalize"/>};
export const EmptySearch:Story={render:()=> <Review/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.type(canvas.getByRole("searchbox",{name:"Search topics and activities"}),"zz-no-matching-topic");
  await expect(canvas.getByText(/No topics match that search/)).toBeInTheDocument();
}};
export const Disabled:Story={render:()=> <Review initial={five} disabled/>};

export const LocalTopicValidation:Story={render:()=> <Review/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByText("Have something else in mind? Add your idea"));
  const input=canvas.getByRole("textbox",{name:"Local topic name"});
  await userEvent.type(input,"x");
  await userEvent.click(canvas.getByRole("button",{name:"Add my idea"}));
  await expect(input).toHaveAttribute("aria-invalid","true");
  await expect(input).toHaveAccessibleDescription("Enter a plain-text local topic name between 2 and 100 characters.");
  await userEvent.clear(input);
  await userEvent.type(input,"Neighborhood history");
  await expect(input).not.toHaveAttribute("aria-invalid","true");
  await userEvent.click(canvas.getByRole("button",{name:"Add my idea"}));
  await expect(input).toHaveValue("");
  await expect(canvas.getByText(/1 of five selected/)).toBeInTheDocument();
}};
