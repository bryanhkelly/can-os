import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassAnnouncementComposer } from "./ClassAnnouncementComposer";

function render(title: string, body: string, busy = false) {
  return renderToStaticMarkup(<ClassAnnouncementComposer title={title} body={body} busy={busy}
    onTitleChange={()=>{}} onBodyChange={()=>{}} onSubmit={()=>{}}/>);
}

describe("ClassAnnouncementComposer", () => {
  it("requires a meaningful title and body", () => {
    expect(render("Hi", "Content")).toContain('disabled=""');
    expect(render("Notice", " ")).toContain('disabled=""');
  });
  it("allows complete announcements but disables during publishing", () => {
    expect(render("Notice", "Class is open")).not.toContain('disabled=""');
    expect(render("Notice", "Class is open", true)).toContain("Publishing...");
    expect(render("Notice", "Class is open", true)).toContain('disabled=""');
  });
});
