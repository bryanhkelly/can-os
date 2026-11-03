import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, mocked, spyOn, userEvent, within } from "storybook/test";
import { DomainError } from "@/domain/errors";
import { EvidenceDocumentLink } from "./EvidenceDocumentLink";

const meta = {
  title: "Evidence/Private document link",
  component: EvidenceDocumentLink,
  args: { onGetDownloadUrl: fn(async () => { throw new DomainError("FORBIDDEN"); }) },
} satisfies Meta<typeof EvidenceDocumentLink>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const UnauthorizedDocument: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open private document" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("You do not have permission to perform this operation.");
    await expect(args.onGetDownloadUrl).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: "Open private document" })).toBeEnabled();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button")).toBeDisabled();
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onGetDownloadUrl).not.toHaveBeenCalled();
  },
};

export const BlockedPopupAndDuplicateClicks: Story = {
  args: { onGetDownloadUrl: fn(async () => "about:blank#isolated-document") },
  play: async ({ canvasElement, args }) => {
    const popup = spyOn(window, "open").mockReturnValue(null);
    try {
      const canvas = within(canvasElement);
      const button = canvas.getByRole("button");
      fireEvent.click(button);
      fireEvent.click(button);
      await expect(await canvas.findByRole("alert")).toHaveTextContent("Unable to open private evidence");
      await expect(args.onGetDownloadUrl).toHaveBeenCalledTimes(1);
      await expect(popup).toHaveBeenCalledTimes(1);
      await expect(button).toBeEnabled();
    } finally { popup.mockRestore(); }
  },
};

export const AuthorizedDocument: Story = {
  args: { onGetDownloadUrl: fn(async () => "about:blank#isolated-document") },
  play: async ({ canvasElement, args }) => {
    const popup = spyOn(window, "open");
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByRole("button"));
      await expect(args.onGetDownloadUrl).toHaveBeenCalledTimes(1);
      await expect(popup).toHaveBeenCalledWith("", "_blank");
      const requestOrder = mocked(args.onGetDownloadUrl).mock.invocationCallOrder[0];
      if (requestOrder === undefined) throw new Error("Expected an authorization request");
      await expect(popup.mock.invocationCallOrder[0]).toBeLessThan(
        requestOrder,
      );
      await expect(popup.mock.results[0]?.value?.opener).toBeNull();
      await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      popup.mock.results[0]?.value?.close();
      popup.mockRestore();
    }
  },
};
