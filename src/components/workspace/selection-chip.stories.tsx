import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { SelectionChip, SelectionChipGroup } from "./selection-chip";

const meta = {
  id: "workspace-selection-chip", title: "03 Components/Selection chip",
  component: SelectionChip,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { children: "Older adults", selected: false, onChange: () => {} },
  argTypes: { density: { control: "inline-radio", options: ["compact", "standard"] } },
} satisfies Meta<typeof SelectionChip>;
export default meta;
type Story = StoryObj<typeof meta>;

const options = ["Children", "Adults", "Older adults", "English language learners",
  "People experiencing homelessness", "Veterans", "Caregivers"];

function Example({ density = "compact", limit = options.length }: {
  density?: "compact" | "standard"; limit?: number;
}) {
  const [selected,setSelected] = useState<string[]>(["Adults"]);
  return <fieldset className="max-w-xl space-y-3">
    <legend className="text-sm font-semibold">Audience selections</legend>
    <p role="status" className="text-xs text-muted-foreground">{selected.length} selected</p>
    <SelectionChipGroup density={density}>
      {options.map(label => <SelectionChip key={label} density={density}
        selected={selected.includes(label)} recommended={label==="Older adults"}
        disabled={!selected.includes(label)&&selected.length>=limit}
        onChange={checked => setSelected(current => checked
          ? [...new Set([...current,label])] : current.filter(item=>item!==label))}>
        {label}
      </SelectionChip>)}
    </SelectionChipGroup>
  </fieldset>;
}

export const Compact: Story = {
  render: () => <Example />,
  play: async ({canvasElement}) => {
    const canvas=within(canvasElement);
    const adults=canvas.getByRole("button",{name:/^Adults$/});
    const learners=canvas.getByRole("button",{name:"English language learners"});
    await expect(adults).toHaveAttribute("aria-pressed","true");
    await expect(learners).toHaveAttribute("aria-pressed","false");
    // Measure the same loaded typeface before and after changing state.
    await document.fonts.ready;
    const width=learners.getBoundingClientRect().width;
    await userEvent.click(learners);
    await expect(learners).toHaveAttribute("aria-pressed","true");
    await expect(learners.getBoundingClientRect().width).toBe(width);
    await expect(canvas.getByRole("status")).toHaveTextContent("2 selected");
    await userEvent.click(learners);
    await expect(learners).toHaveAttribute("aria-pressed","false");
  },
};

export const Standard: Story = { render: () => <Example density="standard"/> };

export const AllStates: Story = {
  render: () => <div className="space-y-6">
    {(["compact","standard"] as const).map(density=><section key={density} className="space-y-2">
      <h3 className="text-sm font-semibold capitalize">{density}</h3>
      <SelectionChipGroup density={density}>
        <SelectionChip density={density} selected={false} onChange={()=>{}}>Available</SelectionChip>
        <SelectionChip density={density} selected onChange={()=>{}}>Selected</SelectionChip>
        <SelectionChip density={density} selected={false} recommended onChange={()=>{}}>Recommended</SelectionChip>
        <SelectionChip density={density} selected={false} disabled onChange={()=>{}}>Disabled</SelectionChip>
        <SelectionChip density={density} selected disabled onChange={()=>{}}>Selected and disabled</SelectionChip>
        <SelectionChip density={density} selected recommended onChange={()=>{}}>Selected and recommended</SelectionChip>
      </SelectionChipGroup>
    </section>)}
  </div>,
  parameters: { chromatic: { modes: { light:{theme:"light"},dark:{theme:"dark"},site:{theme:"site"} } } },
};

export const KeyboardAndLimit: Story = {
  render: () => <Example limit={2}/>,
  play: async ({canvasElement}) => {
    const canvas=within(canvasElement);
    const children=canvas.getByRole("button",{name:"Children"});
    const veterans=canvas.getByRole("button",{name:"Veterans"});
    children.focus();
    await expect(children).toHaveFocus();
    await userEvent.keyboard("[Space]");
    await expect(children).toHaveAttribute("aria-pressed","true");
    await expect(veterans).toBeDisabled();
    await userEvent.keyboard("[Enter]");
    await expect(children).toHaveAttribute("aria-pressed","false");
    await expect(veterans).toBeEnabled();
  },
};

export const NarrowWrapping: Story = {
  render: () => <div className="w-full max-w-72 border p-3"><Example/></div>,
};
