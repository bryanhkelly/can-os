import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { GoLinkLifecycleActions } from "./GoLinkLifecycleActions";

const meta={
  title:"Workflows/Go Links/Lifecycle actions",
  component:GoLinkLifecycleActions,
  args:{status:"active",onTest:fn(),onChange:fn()},
  decorators:[Story=><div className="flex flex-wrap gap-2 bg-background p-6"><Story/></div>],
} satisfies Meta<typeof GoLinkLifecycleActions>;
export default meta;
type Story=StoryObj<typeof meta>;

export const Active:Story={
  play:async({canvasElement,args})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole("button",{name:"Pause"}));
    await expect(args.onChange).toHaveBeenCalledWith("pause");
  },
};
export const Paused:Story={
  args:{status:"paused"},
  play:async({canvasElement,args})=>{
    await userEvent.click(within(canvasElement).getByRole("button",{name:"Resume"}));
    await expect(args.onChange).toHaveBeenCalledWith("resume");
  },
};
export const Revoked:Story={
  args:{status:"revoked"},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.queryByRole("button",{name:"Resume"})).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button",{name:"Revoke"})).not.toBeInTheDocument();
    await expect(canvas.getByRole("button",{name:"Test link"})).toBeEnabled();
  },
};
export const Busy:Story={
  args:{busy:true},
  play:async({canvasElement})=>{
    for(const button of within(canvasElement).getAllByRole("button"))await expect(button).toBeDisabled();
  },
};
