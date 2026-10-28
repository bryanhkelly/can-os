import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExcuseAttachments } from "@/components/operations/ExcuseAttachments";

vi.mock("@/modules/learning/submission-attachments.functions", () => ({
  getExcuseAttachmentDownload: vi.fn(),
}));

describe("ExcuseAttachments reviewer control", () => {
  it("renders a download control per attachment on a pending excuse", () => {
    const html = renderToStaticMarkup(<ExcuseAttachments
      attendanceEventId="a1000000-0000-4000-8000-0000000000e1"
      attachments={[
        { documentId: "a1000000-0000-4000-8000-0000000000d1", fileName: "doctor-note.pdf" },
        { documentId: "a1000000-0000-4000-8000-0000000000d2", fileName: "photo.png" },
      ]}
    />);
    expect(html).toContain("Attached documents");
    expect(html).toContain("doctor-note.pdf");
    expect(html).toContain("photo.png");
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("renders nothing when the excuse has no attachments", () => {
    const html = renderToStaticMarkup(<ExcuseAttachments
      attendanceEventId="a1000000-0000-4000-8000-0000000000e1"
      attachments={[]}
    />);
    expect(html).toBe("");
  });
});
