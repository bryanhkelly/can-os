import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiscussionComposer } from "@/components/learning/DiscussionComposer";

const noOp = vi.fn();

describe("V6.1 student discussion composer", () => {
  it("uses the accessible Field, Textarea and Button controls in both class and group contexts", () => {
    const html = renderToStaticMarkup(<DiscussionComposer
      value="Question about this lesson" onChange={noOp} onSubmit={noOp}
      label="New post" submitLabel="Post message" />);
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>New post/);
    expect(html).toContain('required=""');
    expect(html).toContain('maxLength="3000"');
    expect(html).toContain("Question about this lesson");
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Post message</button>");
  });

  it("prevents empty or whitespace-only posts", () => {
    for (const value of ["", "   "]) {
      const html = renderToStaticMarkup(<DiscussionComposer
        value={value} onChange={noOp} onSubmit={noOp}/>);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Post message<\/button>/);
    }
  });

  it("disables editing and posting while a write is pending", () => {
    const html = renderToStaticMarkup(<DiscussionComposer
      value="Saved? Not yet" onChange={noOp} onSubmit={noOp} pending />);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("supports class replies and cancellation actions with a configurable limit", () => {
    const html = renderToStaticMarkup(<DiscussionComposer
      value="Class reply" onChange={noOp} onSubmit={noOp}
      label="Reply to message" maxLength={5000} submitLabel="Post response">
      <button type="button">Cancel reply</button>
    </DiscussionComposer>);
    expect(html).toContain("Reply to message");
    expect(html).toContain('maxLength="5000"');
    expect(html).toContain("Cancel reply");
    expect(html).toContain("Post response");
  });
});
