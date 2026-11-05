import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassAnnouncementComposer } from "./ClassAnnouncementComposer";

function render(title: string, body: string, busy = false) {
  return renderToStaticMarkup(<ClassAnnouncementComposer title={title} body={body} busy={busy}
    onTitleChange={()=>{}} onBodyChange={()=>{}} onSubmit={()=>{}}/>);
}

describe("ClassAnnouncementComposer", () => {
  it("keeps submission available so invalid fields can show their errors", () => {
    expect(render("Hi", "Content")).not.toContain('disabled=""');
    expect(render("Notice", " ")).not.toContain('disabled=""');
  });
  it("allows complete announcements but disables during publishing", () => {
    expect(render("Notice", "Class is open")).not.toContain('disabled=""');
    expect(render("Notice", "Class is open", true)).toContain("Publishing...");
    expect(render("Notice", "Class is open", true)).toContain('disabled=""');
  });
});
