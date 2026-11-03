import { describe, expect, it } from "vitest";
import { isPublicIPv4, robotsAllows } from "./church-public-web-fetch.server";

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
  it("honors end anchors", () => {
    const robots = "User-agent: *\nDisallow: /private$\n";
    expect(robotsAllows(robots, "/private")).toBe(false);
    expect(robotsAllows(robots, "/private-other")).toBe(true);
  });
});
