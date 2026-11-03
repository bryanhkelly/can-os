import { describe, expect, it } from "vitest";
import { isPublicIPv4, plainHtmlText, robotsAllows } from "./church-public-web-fetch.server";

describe("safe church website DNS targets", () => {
  it.each([
    "0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.5.6", "172.31.255.255", "192.168.0.1",
    "100.64.0.1", "100.127.255.254", "192.0.0.7",
    "192.0.2.3", "198.18.0.1", "198.19.255.255",
    "198.51.100.9", "203.0.113.10", "224.0.0.1",
    "255.255.255.255", "192.88.99.1", "::1",
    "::ffff:127.0.0.1", "127.1", "256.4.3.2",
  ])("blocks nonpublic address %s", address => {
    expect(isPublicIPv4(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "142.250.72.46"])(
    "allows a public address %s", address => {
      expect(isPublicIPv4(address)).toBe(true);
    },
  );
});

describe("bounded HTML excerpt normalization", () => {
  it("excludes scripts, forms, headers and embedded content", () => {
    const html = `<html><header><p>Invisible navigation content that should be excluded.</p></header>
      <main><script>stealSession('data')</script><style>.bad { color:red }</style>
        <h2>Our Church Community Serves Local Families</h2>
        <p>We welcome neighbors and serve with compassion every week.</p>
        <form><p>Enter your password and secret credentials right here.</p></form>
      </main></html>`;
    const text = plainHtmlText(html);
    expect(text).toContain("Our Church Community");
    expect(text).toContain("We welcome neighbors");
    expect(text).not.toContain("stealSession");
    expect(text).not.toContain("Invisible navigation");
    expect(text).not.toContain("password");
    expect(text).not.toContain("<");
  });
  it("bounds long HTML text and deduplicates identical paragraphs", () => {
    const paragraph = "Our local church welcomes everyone to worship and volunteer.";
    const html = `<main><p>${paragraph}</p><p>${paragraph}</p><p>${"a".repeat(3000)}</p></main>`;
    const normalized = plainHtmlText(html);
    expect(normalized.split(paragraph).length - 1).toBe(1);
    expect(normalized.length).toBeLessThanOrEqual(1200);
  });
});

describe("church website robots boundaries", () => {
  it("blocks a wildcard disallow but permits unrelated public pages", () => {
    const robots = "User-agent: *\nDisallow: /private*\n";
    expect(robotsAllows(robots, "/private")).toBe(false);
    expect(robotsAllows(robots, "/private/school")).toBe(false);
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
  it("uses the longer allow when disallow is general", () => {
    const robots = "User-agent: *\nDisallow: /\nAllow: /about\n";
    expect(robotsAllows(robots, "/about")).toBe(true);
    expect(robotsAllows(robots, "/ministries")).toBe(false);
  });
  it("honors targeted CAN user agents and other robots groups separately", () => {
    const robots = "User-agent: Googlebot\nDisallow: /about\n\nUser-agent: CANOS-ChurchReference\nDisallow: /leadership\n";
    expect(robotsAllows(robots, "/about")).toBe(true);
    expect(robotsAllows(robots, "/leadership")).toBe(false);
  });
  it("does not merge wildcard denials into a named CANOS group", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: CANOS-ChurchReference\nAllow: /\n";
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
  it("uses a named CANOS disallow instead of wildcard allowances", () => {
    const robots = "User-agent: *\nAllow: /\n\nUser-agent: CANOS-ChurchReference\nDisallow: /leadership\n";
    expect(robotsAllows(robots, "/leadership")).toBe(false);
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
  it("groups consecutive user agents and separates later groups", () => {
    const robots = "User-agent: Googlebot\nUser-agent: CANOS-ChurchReference\nDisallow: /private\nUser-agent: Otherbot\nDisallow: /about\n";
    expect(robotsAllows(robots, "/private")).toBe(false);
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
  it("honors a more specific named user agent over a shorter name", () => {
    const robots = "User-agent: CANOS\nDisallow: /\nUser-agent: CANOS-ChurchReference\nAllow: /\n";
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
  it("never mistakes a different named bot for CANOS and bypasses wildcard denial", () => {
    const robots = "User-agent: *\\nDisallow: /\\nUser-agent: CANOS-OtherBot\\nAllow: /\\n";
    expect(robotsAllows(robots, "/about")).toBe(false);
  });
  it("honors end anchors", () => {
    const robots = "User-agent: *\nDisallow: /private$\n";
    expect(robotsAllows(robots, "/private")).toBe(false);
    expect(robotsAllows(robots, "/private-other")).toBe(true);
  });
});
