import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { EvidenceDocumentLink } from "./EvidenceDocumentLink";

const meta = {
  title: "Evidence/Private document link",
  component: EvidenceDocumentLink,
  args: { onGetDownloadUrl: fn(async () => { throw new Error("Not authorized"); }) },
} satisfies Meta<typeof EvidenceDocumentLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const UnauthorizedDocument: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open private document" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Not authorized");
    await expect(args.onGetDownloadUrl).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: "Open private document" })).toBeEnabled();
  },
};
