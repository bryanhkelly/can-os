import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { SelectionCard } from "./selection-card";

const meta = {
  id: "workspace-v6-1-selection-cards", title: "03 Components/Selection cards",
  component: SelectionCard,
  parameters: { layout: "padded" },
  args: {
    kind: "radio",
    title: "Your organization",
    checked: false,
    onChange: () => {},
  },
} satisfies Meta<typeof SelectionCard>;
export default meta;
type Story = StoryObj<typeof meta>;

function SelectionStates() {
  const [host, setHost] = useState("own");
  const [programs, setPrograms] = useState(["afterschool"]);
  return <div className="mx-auto max-w-5xl space-y-6">
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">Single choice · Site hosting</legend>
      <div className="grid gap-3 md:grid-cols-3">
        <SelectionCard kind="radio" name="host-demo" value="own" title="Your organization"
          detail="Your organization hosts its activities" checked={host === "own"}
          onChange={checked => { if (checked) setHost("own"); }} />
        <SelectionCard kind="radio" name="host-demo" value="another" title="Another organization"
          detail="A separate organization hosts us" checked={host === "another"}
          onChange={checked => { if (checked) setHost("another"); }} />
        <SelectionCard kind="radio" name="host-demo" value="undecided" title="Not decided yet"
          detail="We are still exploring options" checked={host === "undecided"}
          onChange={checked => { if (checked) setHost("undecided"); }} />
      </div>
    </fieldset>
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">Multiple choice · Program interests</legend>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { id: "afterschool", title: "After-school", detail: "Enrichment and support" },
          { id: "summer", title: "Summer & Breaks", detail: "Seasonal experiences" },
        ].map(option => <SelectionCard key={option.id} kind="checkbox"
          value={option.id} title={option.title} detail={option.detail}
          checked={programs.includes(option.id)}
          onChange={checked => setPrograms(current => checked
            ? [...current, option.id] : current.filter(id => id !== option.id))} />)}
        <SelectionCard kind="checkbox" value="school-year" title="Grades 9–12"
          detail="School-year authorization required · unavailable for this Site"
          checked disabled onChange={() => {}} />
      </div>
    </fieldset>
  </div>;
}

export const RadioCheckboxAndDisabled: Story = {
  render: () => <SelectionStates />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const another = canvas.getByRole("radio", { name: /Another organization/ });
    await userEvent.click(another);
    await expect(another).toBeChecked();
    await expect(canvas.getByRole("radio", { name: /Your organization/ })).not.toBeChecked();
    const summer = canvas.getByRole("checkbox", { name: /Summer & Breaks/ });
    await userEvent.click(summer);
    await expect(summer).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: /Grades 9–12/ })).toBeDisabled();
  },
};
