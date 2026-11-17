import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordedTime, formatRecordedTime } from "@/components/workflow/recorded-time";

const instant = "2026-11-17T19:00:00.000Z";

describe("V6.1 shared recorded-time presentation", () => {
  it("formats authorized source instants in a stable time zone while preserving evidence", () => {
    const utc = renderToStaticMarkup(<RecordedTime value={instant}/>);
    const site = renderToStaticMarkup(<RecordedTime value={instant}
      timeZone="America/Los_Angeles"/>);
    expect(utc).toContain("Nov 17, 2026, 7:00 PM UTC");
    expect(site).toContain("Nov 17, 2026, 11:00 AM PST");
    for (const html of [utc, site]) expect(html).toContain(`dateTime="${instant}"`);
    expect(utc).not.toContain("Delivered to recipient");
  });

  it("fails visibly for invalid instants or unknown display zones", () => {
    expect(formatRecordedTime("invalid")).toBeNull();
    expect(formatRecordedTime("2026-11-17T19:00:00")).toBeNull();
    expect(formatRecordedTime("2026-11-17")).toBeNull();
    expect(formatRecordedTime("2026-11-17T19:00:00+00:00")).toContain("7:00 PM UTC");
    expect(formatRecordedTime(instant, "bad-zone")).toBeNull();
    const html = renderToStaticMarkup(<RecordedTime value="invalid" fallback="Time not verified"/>);
    expect(html).toContain("Time not verified");
    expect(html).toContain('dateTime="invalid"');
    expect(html).not.toContain("Invalid Date");
  });

  it("supports a source-owned label without changing the instant or implying a receipt", () => {
    const html = renderToStaticMarkup(<RecordedTime value={instant}>Provider accepted: </RecordedTime>);
    expect(html).toContain("Provider accepted: ");
    expect(html).toContain("Nov 17, 2026, 7:00 PM UTC");
  });
});
