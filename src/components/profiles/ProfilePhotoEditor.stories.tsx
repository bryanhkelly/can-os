import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ProfilePhotoEditor } from "./ProfilePhotoEditor";

const meta = {
  title: "V6.1 templates/People/Profile picture",
  component: ProfilePhotoEditor,
  args: { name: "Alex Example", changed: fn(), createUploadTask: () => ({ run: async () => ({}) }), deletePhoto: fn(async () => ({})) },
  decorators: [Story => <div className="mx-auto max-w-xl bg-card p-6"><Story/></div>],
} satisfies Meta<typeof ProfilePhotoEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("img", { name: "Alex Example: no profile photo" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save picture" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Remove picture" }));
    const dialog = within(document.body).getByRole("dialog", { name: "Remove profile picture" });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await expect(args.deletePhoto).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Remove picture" })).toHaveFocus();
  },
};

export const RemovalFailure: Story = {
  args: { deletePhoto: fn(async () => { throw new Error("Unavailable"); }) },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Remove picture" }));
    const dialog = within(document.body).getByRole("dialog", { name: "Remove profile picture" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove picture" }));
    await expect(within(dialog).getByRole("alert")).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "Remove picture" })).toBeEnabled();
  },
};

export const Cropping: Story = {
  args: { createUploadTask: fn(() => ({ run: fn(async () => ({})) })) },
  play: async ({ canvas, args }) => {
    const bitmap = document.createElement("canvas");
    bitmap.width = 800; bitmap.height = 600;
    const context = bitmap.getContext("2d")!;
    context.fillStyle = "#1769ef"; context.fillRect(0, 0, 800, 600);
    context.fillStyle = "#16845b"; context.fillRect(200, 150, 400, 300);
    const blob = await new Promise<Blob>(resolve => bitmap.toBlob(value => resolve(value!), "image/png"));
    await userEvent.upload(canvas.getByLabelText("Profile picture"), new File([blob], "synthetic-photo.png", {type:"image/png"}));
    const save = canvas.getByRole("button", {name:"Save picture"});
    await waitFor(() => expect(save).toBeEnabled());
    const zoom = canvas.getByRole("slider", {name:"Zoom"});
    await userEvent.click(zoom);
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(save);
    await expect(await canvas.findByRole("status")).toHaveTextContent("Profile picture saved.");
    await expect(args.createUploadTask).toHaveBeenCalledOnce();
    await expect(args.changed).toHaveBeenCalledOnce();
    await expect(save).toBeDisabled();
  },
};

export const InvalidFile: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.upload(canvas.getByLabelText("Profile picture"), new File(["not a photo"], "notes.txt", {type:"text/plain"}), {applyAccept:false});
    await expect(canvas.getByRole("alert")).toHaveTextContent("Choose a JPEG or PNG picture up to 2 MB.");
    await expect(canvas.getByRole("button", {name:"Save picture"})).toBeDisabled();
    await expect(args.changed).not.toHaveBeenCalled();
  },
};