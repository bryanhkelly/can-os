import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyInvitationForm } from "../../src/components/admissions/FamilyInvitationForm";

const draft = {
  programId: "program", contacts: "", subject: "Stay connected",
  introduction: "We are exploring learning opportunities for our community.",
};

describe("Launch Studio recruitment reuses the governed invitation form", () => {
  it("distinguishes preopening interest from an application", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm purpose="interest"
      programs={[{ id: "program", name: "Developing Program" }]}
      draft={draft} busy={false} onChange={() => {}} onSubmit={() => {}} />);
    expect(html).toContain("Invite consenting adults to express interest");
    expect(html).toContain("Eligible developing Program");
    expect(html).toContain("Only include adults who have requested or consented");
    expect(html).not.toContain("Send a private receiving-school application invitation");
  });

  it("does not offer application sending as interest outreach when no Program is eligible", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm purpose="interest"
      programs={[]} draft={{ ...draft, programId: "" }} busy={false}
      onChange={() => {}} onSubmit={() => {}} />);
    expect(html).toContain("No eligible developing school Programs");
    expect(html).not.toContain("Queue secure invitations");
  });

  it("preserves the authorized application workflow for older callers", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[{ id: "program", name: "Operating Program" }]} draft={draft}
      busy={false} onChange={() => {}} onSubmit={() => {}} />);
    expect(html).toContain("Send a private receiving-school application invitation");
    expect(html).toContain("Authorized school Program");
  });
});
