import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, fn, fireEvent } from "storybook/test";
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


export const UploadAndFinalize: Story = {
  args: { onUploaded: fn(async () => {}), adapter: {
    begin: fn(async () => ({ key: "uploaded-once", uploadUrl: "/mock-private-upload", uploadHeaders: {} })),
    finish: fn(async () => {}),
  } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    let byteUploads = 0;
    globalThis.fetch = async () => { byteUploads++; return new Response(null, { status: 200 }); };
    try {
      const fileInput = canvas.getByLabelText("PDF, JPEG or PNG") as HTMLInputElement;
      const dateInput = canvas.getByLabelText("Evidence expires on") as HTMLInputElement;
      await userEvent.upload(fileInput, new File(["document"], "approval.pdf", { type: "application/pdf" }));
      fireEvent.change(dateInput, { target: { value: "2027-05-01" } });
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      await expect(args.adapter.finish).toHaveBeenCalled();
      await expect(fileInput.value).toBe("");
      await expect(args.onUploaded).toHaveBeenCalled();
      await expect(byteUploads).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
};


export const RefreshFailureDoesNotRepeatFinalization: Story = {
  args: { onUploaded: fn(async () => { throw new Error("Refresh unavailable"); }),
    adapter: {
      begin: fn(async () => ({ key: "recorded", uploadUrl: "/mock-private-upload", uploadHeaders: {} })),
      finish: fn(async () => {}),
    } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 200 });
    try {
      await userEvent.upload(canvas.getByLabelText("PDF, JPEG or PNG"),
        new File(["document"], "approval.pdf", { type: "application/pdf" }));
      fireEvent.change(canvas.getByLabelText("Evidence expires on"),
        { target: { value: "2027-05-01" } });
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      await expect(await canvas.findByRole("alert")).toHaveTextContent("Evidence recorded, but refresh failed");
      await expect(args.adapter.finish).toHaveBeenCalledTimes(1);
      await expect(canvas.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    } finally { globalThis.fetch = originalFetch; }
  },
};


export const RetryFinalizationWithoutReupload: Story = {
  args: {
    adapter: {
      begin: fn(async () => ({ key: "retry-key", uploadUrl: "/mock-private-upload", uploadHeaders: {} })),
      finish: fn().mockRejectedValueOnce(new Error("Temporary finalization failure"))
        .mockResolvedValue(undefined),
    },
    onUploaded: fn(async () => {}),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    let uploads = 0;
    globalThis.fetch = async () => { uploads++; return new Response(null, { status: 200 }); };
    try {
      await userEvent.upload(canvas.getByLabelText("PDF, JPEG or PNG"),
        new File(["document"], "approval.pdf", { type: "application/pdf" }));
      fireEvent.change(canvas.getByLabelText("Evidence expires on"),
        { target: { value: "2027-05-01" } });
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      await expect(canvas.findByRole("alert")).resolves.toHaveTextContent("Temporary finalization failure");
      await userEvent.click(canvas.getByRole("button", { name: "Retry recording uploaded evidence" }));
      await expect(args.adapter.finish).toHaveBeenCalledTimes(2);
      await expect(args.adapter.begin).toHaveBeenCalledTimes(1);
      await expect(uploads).toBe(1);
    } finally { globalThis.fetch = originalFetch; }
  },
};

export const ChangeDocumentAfterFailedFinalization: Story = {
  args: {
    adapter: {
      begin: fn(async () => ({ key: "new-key", uploadUrl: "/mock-private-upload", uploadHeaders: {} })),
      finish: fn().mockRejectedValueOnce(new Error("First document rejected"))
        .mockResolvedValue(undefined),
    },
    onUploaded: fn(async () => {}),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    let uploads = 0;
    globalThis.fetch = async () => { uploads++; return new Response(null, { status: 200 }); };
    try {
      const input = canvas.getByLabelText("PDF, JPEG or PNG");
      await userEvent.upload(input, new File(["first"], "first.pdf", { type: "application/pdf" }));
      fireEvent.change(canvas.getByLabelText("Evidence expires on"),
        { target: { value: "2027-05-01" } });
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      await expect(canvas.findByRole("alert")).resolves.toHaveTextContent("First document rejected");
      await userEvent.upload(input, new File(["second"], "second.pdf", { type: "application/pdf" }));
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      await expect(args.adapter.begin).toHaveBeenCalledTimes(2);
      await expect(args.adapter.finish).toHaveBeenCalledTimes(2);
      await expect(uploads).toBe(2);
    } finally { globalThis.fetch = originalFetch; }
  },
};


export const BlocksRepeatedSubmissionWhileUploading: Story = {
  args: {
    adapter: {
      begin: fn(async () => ({ key: "once", uploadUrl: "/mock-private-upload", uploadHeaders: {} })),
      finish: fn(async () => {}),
    },
    onUploaded: fn(async () => {}),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    let releaseUpload: () => void = () => {};
    let uploadCount = 0;
    globalThis.fetch = async () => {
      uploadCount++;
      await new Promise<void>(resolve => { releaseUpload = resolve; });
      return new Response(null, { status: 200 });
    };
    try {
      await userEvent.upload(canvas.getByLabelText("PDF, JPEG or PNG"),
        new File(["document"], "approval.pdf", { type: "application/pdf" }));
      fireEvent.change(canvas.getByLabelText("Evidence expires on"),
        { target: { value: "2027-05-01" } });
      await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
      const submitting = canvas.getByRole("button", { name: "Submitting…" });
      await expect(submitting).toBeDisabled();
      await expect(uploadCount).toBe(1);
      releaseUpload();
      await expect(args.adapter.finish).toHaveBeenCalledTimes(1);
    } finally {
      releaseUpload();
      globalThis.fetch = originalFetch;
    }
  },
};
