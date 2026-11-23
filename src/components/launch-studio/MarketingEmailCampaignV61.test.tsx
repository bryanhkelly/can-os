import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarketingEmailCampaignV61 } from "./MarketingEmailCampaignV61";

// The layout contract is tested without sending email or connecting to a database.
vi.mock("@/modules/programs/site-marketing-artifacts.functions", () => ({
  getSiteMarketingReleaseOutput: vi.fn(),
}));
vi.mock("@/modules/programs/site-marketing-email.functions", () => ({
  listSiteMarketingEmailCampaigns: vi.fn(),
  queueSiteMarketingEmailCampaign: vi.fn(),
}));

const props = {
  siteId: "11111111-1111-4111-8111-111111111111",
  packageId: "22222222-2222-4222-8222-222222222222",
  releaseId: "33333333-3333-4333-8333-333333333333",
  emailOutputId: "44444444-4444-4444-8444-444444444444",
  releaseNumber: 2,
  emailSubject: "Welcome to our learning community",
  canCreateMaterials: true,
  onCreateMaterials: vi.fn(),
};

describe("V6.1 Launch Studio email sending layout", () => {
  it("shows the recipient editor before materials exist", () => {
    const html = renderToStaticMarkup(<MarketingEmailCampaignV61 {...props}
      releaseId={null} emailOutputId={null} releaseNumber={null} emailSubject={null}/>);
    expect(html).toContain("To · Recipient email addresses");
    expect(html).toContain("person@example.org");
    expect(html).toContain("Create Email Materials");
    expect(html.indexOf("To · Recipient")).toBeLessThan(html.indexOf("Create Email Materials"));
    expect(html).not.toContain("Send Email to 0 Recipients");
  });

  it("places addresses first, then frozen subject, compact preview, consent and send", () => {
    const html = renderToStaticMarkup(<MarketingEmailCampaignV61 {...props}/>);
    const ordered = [
      "To · Recipient email addresses",
      "Email subject",
      props.emailSubject,
      "Preview branded email",
      "Sender&#x27;s physical mailing address",
      "I confirm that each address",
      "Send Email to 0 Recipients",
    ];
    let previous = -1;
    for (const text of ordered) {
      const at = html.indexOf(text);
      expect(at, "Missing or out-of-order layout content: " + text).toBeGreaterThan(previous);
      previous = at;
    }
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen[=>]/);
    expect(html).toContain("Send Test to My Email");
    expect(html).toContain("disabled=");
  });
});
