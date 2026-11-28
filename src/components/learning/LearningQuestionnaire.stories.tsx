import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LearningQuestionnaire, type LearningQuestion } from "./LearningQuestionnaire";

const questions:LearningQuestion[]=[{
  id:"shared-question",type:"single_choice",required:true,prompt:"Choose an answer",
  options:[{id:"first",label:"First answer"},{id:"second",label:"Second answer"}],min:null,max:null,
}];
const meta={id: "v6-1-learning-questionnaire", title: "08 Feature workspaces/Learning/Questionnaire",component:LearningQuestionnaire,
  args:{title:"Knowledge check",questions,onSubmit:fn(async()=>{})},
  parameters:{layout:"padded"}} satisfies Meta<typeof LearningQuestionnaire>;
export default meta;
type Story=StoryObj<typeof meta>;

export const IndependentQuestionnaires:Story={
  render:args=><div className="max-w-2xl space-y-4">
    <LearningQuestionnaire {...args} title="Before learning"/>
    <LearningQuestionnaire {...args} title="After learning"/>
  </div>,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const before=within(canvas.getByRole("form",{name:"Before learning"}));
    const after=within(canvas.getByRole("form",{name:"After learning"}));
    const first=before.getByRole("radio",{name:"First answer"});
    const second=after.getByRole("radio",{name:"Second answer"});
    await userEvent.click(first);
    await userEvent.click(second);
    await expect(first).toBeChecked();
    await expect(second).toBeChecked();
  },
};

export const RequiredQuestion:Story={
  play:async({canvasElement,args})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole("button",{name:"Submit responses"}));
    await expect(canvas.getByRole("alert")).toHaveTextContent("A required question was skipped");
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("radio",{name:"First answer"}));
    await userEvent.click(canvas.getByRole("button",{name:"Submit responses"}));
    await expect(args.onSubmit).toHaveBeenCalledWith([{questionId:"shared-question",optionIds:["first"]}]);
  },
};
