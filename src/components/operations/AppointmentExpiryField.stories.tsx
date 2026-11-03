import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, within } from "storybook/test";
import { AppointmentExpiryField } from "./AppointmentExpiryField";

const meta = {
  title: "Operations/Appointment expiry",
  component: AppointmentExpiryField,
  args: { label: "Appointment ends", value: "", onChange: () => {} },
} satisfies Meta<typeof AppointmentExpiryField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => {
    const [value, setValue] = useState("");
    return <AppointmentExpiryField {...args} value={value} onChange={setValue}/>;
  },
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText("Appointment ends");
    const minimum = field.getAttribute("min");
    fireEvent.change(field, { target: { value: minimum } });
    await expect(field).toHaveValue(minimum);
    await expect(field).toHaveAttribute("max");
  },
};
export const Disabled: Story = { args: { disabled: true } };
