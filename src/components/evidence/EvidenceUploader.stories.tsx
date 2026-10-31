import type { Meta, StoryObj } from "@storybook/react";
import { EvidenceUploader } from "./EvidenceUploader";
type Upload = { fileName: string; mimeType: "application/pdf" | "image/jpeg" | "image/png";
  size: number; expiresAt: string };
const meta = {
  title: "Evidence/Uploader",
  component: EvidenceUploader<Upload>,
  args: {
    adapter: { begin: async () => ({ key: "example", uploadUrl: "/storybook-private-upload",
      uploadHeaders: {} }), finish: async () => {} },
    makeInput: (file: File, expiresAt: string) => ({
      fileName: file.name, mimeType: file.type as Upload["mimeType"], size: file.size, expiresAt,
    }),
    onUploaded: async () => {},
  },
} satisfies Meta<typeof EvidenceUploader<Upload>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UploadsDisabled: Story = { args: { disabled: true } };
