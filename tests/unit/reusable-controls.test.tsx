import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteProgramFields } from "@/components/workspace/site-program-fields";
import { LocalDateTimeField } from "@/components/workspace/local-datetime-field";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { FileSelectionField, UploadedFileNotice } from "@/components/evidence/FileSelectionField";
import { QueryState } from "@/components/workspace";

const idle = { pending: false, error: "", notice: "", refreshFailed: false };
describe("reusable workflow presentation", () => {
  it("announces pending instead of stale errors or success", () => {
    const html = renderToStaticMarkup(<MutationFeedback state={{...idle,pending:true,error:"Old error",notice:"Old success"}}
      pendingMessage="Saving trip..."/>);
    expect(html).toContain('role="status"');
    expect(html).toContain("Saving trip...");
    expect(html).not.toContain("Old");
  });
  it("distinguishes a failed command from failed refresh without showing a stale success action", () => {
    const html = renderToStaticMarkup(<MutationFeedback state={{...idle,error:"Unable to save"}}
      pendingMessage="Saving..." successAction={<a href="#saved">Saved record</a>}/>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("The command could not be confirmed.");
    expect(html).not.toContain("Saved record");
  });
  it("preserves a real saved-record link on refresh failure and avoids a second success announcement", () => {
    const html = renderToStaticMarkup(<MutationFeedback state={{...idle,error:"Reopen this page",notice:"Saved",refreshFailed:true}}
      pendingMessage="Saving..." successAction={<a href="#saved">Open saved record</a>}/>);
    expect(html).toContain("The command succeeded.");
    expect(html).toContain('href="#saved"');
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).not.toContain('role="status"');
  });
  it("offers a non-submit retry and retains confirmation while reconciliation is pending", () => {
    const html = renderToStaticMarkup(<MutationFeedback state={{
      ...idle, error: "Refresh failed", notice: "Saved", refreshFailed: true,
      retryRefresh: async () => ({ status: "refreshed" }),
    }} pendingMessage="Saving..."/>);
    expect(html).toContain("Retry refresh");
    expect(html).toContain('type="button"');
    expect(html).toContain("Saved");
    const pending = renderToStaticMarkup(<MutationFeedback state={{
      ...idle, pending: true, notice: "Saved", refreshFailed: true,
    }} pendingMessage="Saving..."/>);
    expect(pending).toContain("Refreshing saved changes...");
    expect(pending).toContain("Saved");
    expect(pending).not.toContain("Retry refresh");
  });
  it("announces successful commands and renders nothing when idle", () => {
    expect(renderToStaticMarkup(<MutationFeedback state={idle} pendingMessage="Saving..."/>)).toBe("");
    const html=renderToStaticMarkup(<MutationFeedback state={{...idle,notice:"Trip saved"}} pendingMessage="Saving..."/>);
    expect(html).toContain("Trip saved");
    expect(html).toContain('role="status"');
  });
  it("filters programs while retaining required school and domain-specific all-program language", () => {
    const html = renderToStaticMarkup(<SiteProgramFields sites={[{id:"school",name:"School"}]}
      programs={[{id:"ours",siteId:"school",name:"Our program"},{id:"other",siteId:"elsewhere",name:"Other program"}]}
      siteId="school" programId="" siteRequired programPlaceholder="All enrolled programs at this school" onChange={()=>{}}/>);
    expect(html).toContain("Our program");
    expect(html).not.toContain("Other program");
    expect(html).toContain("All enrolled programs at this school");
    expect(html).not.toContain("All permitted schools");
    expect(html).toContain('required=""');
  });
  it("renders explicit resource timezone and unchanged wall-clock inputs", () => {
    const html = renderToStaticMarkup(<LocalDateTimeField label="Departure" timezone="America/Los_Angeles"
      value="2027-01-15T09:30" onChange={()=>{}} required disabled/>);
    expect(html).toContain("Departure (America/Los_Angeles)");
    expect(html).toContain('value="2027-01-15T09:30"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('required=""');
  });
  it("keeps file-selection policy explicit and announces only stored bytes, not domain completion", () => {
    const html=renderToStaticMarkup(<FileSelectionField label="Private document" file={null} onChange={()=>{}}
      accept="application/pdf" disabled required/>);
    expect(html).toContain('accept="application/pdf"');
    expect(html).toContain('type="file"');
    expect(html).toContain('disabled=""');
    const notice=renderToStaticMarkup(<UploadedFileNotice/>);
    expect(notice).toContain("Retry recording without uploading the bytes again.");
    expect(notice).not.toContain("approved");
  });
  it("never displays stale records in error, loading or empty query states", () => {
    for (const props of [{error:"Failed"},{loading:"Loading"},{isEmpty:true}]) {
      expect(renderToStaticMarkup(<QueryState {...props}><p>Stale records</p></QueryState>)).not.toContain("Stale records");
    }
  });
});
