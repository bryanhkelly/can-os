import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentAccept,
  attachmentMimeByExtension,
  attachmentMimeForFileName,
  validateAttachmentUpload,
} from "@/modules/learning/attachment-mimes";

describe("learning attachment allowlist (client picker / server validation agreement)", () => {
  it("accept attribute matches the server-enforced extensions exactly", () => {
    expect(attachmentAccept.split(",").map((entry) => entry.slice(1)).sort())
      .toEqual(Object.keys(attachmentMimeByExtension).sort());
    expect(attachmentAccept).toBe(".pdf,.png,.jpg,.jpeg");
  });

  it("resolves MIME types for allowed extensions only", () => {
    expect(attachmentMimeForFileName("doctor-note.pdf")).toBe("application/pdf");
    expect(attachmentMimeForFileName("photo.PNG")).toBe("image/png");
    expect(attachmentMimeForFileName("scan.jpeg")).toBe("image/jpeg");
    // Drifted types from the old picker list are not attachable.
    expect(attachmentMimeForFileName("essay.docx")).toBeNull();
    expect(attachmentMimeForFileName("notes.txt")).toBeNull();
    expect(attachmentMimeForFileName("readme.md")).toBeNull();
  });

  it("server validation accepts the allowed set and rejects everything else", () => {
    for (const [extension, mime] of Object.entries(attachmentMimeByExtension)) {
      expect(() => validateAttachmentUpload(`evidence.${extension}`, mime, 1024)).not.toThrow();
    }
    expect(() => validateAttachmentUpload(
      "essay.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      1024,
    )).toThrow("Only verified PDF, PNG and JPEG attachments are supported");
    expect(() => validateAttachmentUpload("note.pdf", "text/plain", 1024))
      .toThrow("File content type does not match its extension");
    expect(() => validateAttachmentUpload("note.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1))
      .toThrow("Attachments must be 16 bytes to 10 MB");
    expect(() => validateAttachmentUpload("note.pdf", "application/pdf", 4))
      .toThrow("Attachments must be 16 bytes to 10 MB");
  });
});
