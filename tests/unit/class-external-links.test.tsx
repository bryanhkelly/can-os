import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SafeClassExternalLink, safeClassExternalHref,
} from "@/components/learning/SafeClassExternalLink";

describe("external classroom resource links", () => {
  it("retains valid HTTPS resources, including server-permitted custom ports", () => {
    expect(safeClassExternalHref("https://school.example.test/lesson?unit=1"))
      .toBe("https://school.example.test/lesson?unit=1");
    expect(safeClassExternalHref("https://content.example.test:8443/reading"))
      .toBe("https://content.example.test:8443/reading");
    const html = renderToStaticMarkup(<SafeClassExternalLink
      url="https://school.example.test/reading" title="A reading" kind="external" resourceId="resource-1"/>);
    expect(html).toContain('href="https://school.example.test/reading"');
    expect(html).toContain('data-learning-resource-id="resource-1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not render clickable anchors for malformed or unsafe legacy links", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://school.example.test/reading",
      "https://user:pass@school.example.test/reading",
      "//school.example.test/reading",
      "not a url",
      "https://school.example.test/" + "x".repeat(2050),
    ]) {
      expect(safeClassExternalHref(url)).toBeNull();
      const html = renderToStaticMarkup(<SafeClassExternalLink
        url={url} title="Unavailable reference" kind="link"/>);
      expect(html).not.toContain("<a ");
      expect(html).toContain("external link unavailable");
    }
  });
});
