import { describe, expect, it } from "vitest";
import {
  appendMarketingFooter, emailOptedOutPreviously, formatMarketingFooter,
  marketingEmailDeliverySummary, marketingEmailMetadataSchema, parseMarketingEmailRecipients,
} from "@/domain/site-marketing-email";

describe("marketing email recipient preflight", () => {
  it("normalizes emails, deduplicates, and permits only one email per line", () => {
    expect(parseMarketingEmailRecipients("A@EXAMPLE.COM\nb@example.com\na@example.com"))
      .toEqual(["a@example.com", "b@example.com"]);
    expect(() => parseMarketingEmailRecipients("Alice <alice@example.com>")).toThrow();
    expect(() => parseMarketingEmailRecipients("")).toThrow();
    expect(() => parseMarketingEmailRecipients("child@example.com,other@example.com")).toThrow();
    expect(() => parseMarketingEmailRecipients("a@example.com\n".repeat(26))).toThrow();
  });

  it("tracks provider acceptance separately from delivery and suppressions", () => {
    expect(marketingEmailDeliverySummary([
      {key:"1",email:"a@example.com",status:"accepted",attempts:1},
      {key:"2",email:"b@example.com",status:"queued",attempts:0},
      {key:"3",email:"c@example.com",status:"failed",attempts:1},
      {key:"4",email:"d@example.com",status:"suppressed",attempts:0},
    ])).toEqual({total:4,accepted:1,queued:1,failed:1,suppressed:1});
  });

  it("persists opt-outs across campaigns for the same email", () => {
    expect(emailOptedOutPreviously("a@example.com",[
      {recipients:[{key:"1",email:"a@example.com",status:"accepted",
        attempts:1,optedOutAt:"2026-11-23T12:00:00Z"}]},
    ])).toBe(true);
    expect(emailOptedOutPreviously("b@example.com",[
      {recipients:[{key:"1",email:"a@example.com",status:"accepted",
        attempts:1,optedOutAt:"2026-11-23T12:00:00Z"}]},
    ])).toBe(false);
  });

  it("escapes the mailing address and inserts a confirmed unsubscribe link", () => {
    const footer = formatMarketingFooter("12 <Market> St, City, CA 90001",
      "https://app.example.org/marketing/unsubscribe?batchId=x&key=y");
    expect(footer.html).toContain("&lt;Market&gt;");
    expect(footer.html).not.toContain("<Market>");
    expect(appendMarketingFooter("<html><body>Message</body></html>",footer.html))
      .toMatch(/Unsubscribe<\/a><\/div><\/body><\/html>$/);
    expect(footer.text).toContain("Unsubscribe:");
  });

  it("rejects malformed campaign metadata before any worker dispatch", () => {
    expect(marketingEmailMetadataSchema.safeParse({kind:"site_marketing_email_campaign"}).success)
      .toBe(false);
  });
});
