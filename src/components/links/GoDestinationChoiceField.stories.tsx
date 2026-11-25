import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,fn,userEvent,within} from "storybook/test";
import {GoDestinationChoiceField} from "./GoDestinationChoiceField";
import type {GoDestinationChoice} from "@/domain/site-go-links";

const choices:GoDestinationChoice[]=[
  {destination:{kind:"information",journeyId:"learn-more"},title:"Learn more",description:"Public information"},
  {destination:{kind:"site-page",page:"contact"},title:"Contact the Site",description:"Published page"},
];
const meta={
  title:"Workflows/Go Links/Destination choice",
  component:GoDestinationChoiceField,
  args:{choices,value:null,onChange:fn()},
  decorators:[Story=><div className="max-w-md bg-background p-4"><Story/></div>],
} satisfies Meta<typeof GoDestinationChoiceField>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Available:Story={
  play:async({canvasElement,args})=>{
    await userEvent.selectOptions(within(canvasElement).getByRole("combobox"),"site-page:contact");
    await expect(args.onChange).toHaveBeenCalledWith(choices[1]!.destination);
  },
};
export const Selected:Story={args:{value:choices[0]!.destination},play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole("combobox")).toHaveValue("information:learn-more");
}};
export const Empty:Story={args:{choices:[]},play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole("combobox")).toBeDisabled();
}};
export const UnavailableSelection:Story={args:{value:{kind:"site-page",page:"home"}},play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole("combobox")).toHaveValue("");
}};
export const Disabled:Story={args:{disabled:true},play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole("combobox")).toBeDisabled();
}};
