import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { ClassVideoPlayer } from "./ClassVideoPlayer";
import { DomainError } from "@/domain/errors";

const meta = {
  title: "Learning/Class video player",
  component: ClassVideoPlayer,
  args: { title: "Teacher lesson video", url: "https://www.youtube.com/watch?v=abcdefghijk" },
} satisfies Meta<typeof ClassVideoPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LinkedVideo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Play video" })).toBeVisible();
    await expect(canvasElement.querySelector("iframe")).toBeNull();
    await expect(canvasElement.querySelector("video")).toBeNull();
  },
};
export const PrivateVideo: Story = {
  args: { url: null, loadUrl: fn(async () => { throw new DomainError("FORBIDDEN"); }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const play = canvas.getByRole("button", { name: "Play video" });
    fireEvent.click(play); fireEvent.click(play);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("You do not have permission");
    await expect(args.loadUrl).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelector("video")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Retry playback" }));
    await expect(args.loadUrl).toHaveBeenCalledTimes(2);
  },
};
export const InvalidPrivateSource: Story = {
  args: { url: null, loadUrl: fn(async () => "javascript:alert(1)") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Play video" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("This video source is not supported");
    await expect(canvasElement.querySelector("video")).toBeNull();
  },
};
export const ExternalOnly: Story = { args: { url: "https://example.com/teacher-video-page", declaredVideo: false } };
