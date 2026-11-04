import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardHome, DashboardHero } from "@/components/workspace/dashboard-home";
import { DashboardPanel, DashboardShortcut } from "@/components/workspace/dashboard-layout";

describe("shared role dashboard composition", () => {
  it.each(["Teacher Today", "Family home", "Needs You", "Site Today", "Specialist caseload", "Counselor caseload", "Denomination HQ", "Partner contracts"])(
    "uses the student visual composition for %s without inventing data", title => {
      const html = renderToStaticMarkup(<DashboardHome title={title} eyebrow="CAN OS"
        shortcuts={<DashboardShortcut title="Current work"><a href="#work" /></DashboardShortcut>}
        actions={<a href="/messages">Messages</a>}>
        <DashboardPanel id="work" title="Authorized work">No work in scope.</DashboardPanel>
      </DashboardHome>);
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain("can-dashboard-hero");
      expect(html).toContain("role-dashboard");
      expect(html).toContain('aria-label="Dashboard shortcuts"');
      expect(html).toContain('href="#work"');
      expect(html).toContain('href="/messages"');
      expect(html).toContain("No work in scope.");
      expect(html).not.toContain("DailyCanvas");
    },
  );

  it("keeps safety warnings ahead of the wallpaper and shortcuts", () => {
    const html = renderToStaticMarkup(<DashboardHome title="School"
      priority={<p role="alert">Opening blocked</p>} shortcuts={<a href="#work">Work</a>}>
      <p>School records</p>
    </DashboardHome>);
    expect(html.indexOf("Opening blocked")).toBeLessThan(html.indexOf("can-dashboard-hero"));
    expect(html.indexOf("can-dashboard-hero")).toBeLessThan(html.indexOf("Dashboard shortcuts"));
    expect(html).not.toContain("<aside");
  });

  it("keeps actual schedule content in the contextual rail", () => {
    const html = renderToStaticMarkup(<DashboardHome title="School" shortcuts={<a href="#work">Work</a>}
      rail={<DashboardPanel title="Schedule">Schedule unavailable.</DashboardPanel>}>
      <p>Authorized work</p>
    </DashboardHome>);
    expect(html.indexOf("Authorized work")).toBeLessThan(html.indexOf("<aside"));
    expect(html).toContain("Schedule unavailable.");
  });

  it("preserves the student's dated hero with the shared wallpaper", () => {
    const html = renderToStaticMarkup(<DashboardHero title="Good morning, Jordan." date="Tuesday, Nov 5"
      eyebrow="Your learning day" subtitle="Your next step." />);
    expect(html).toContain("Good morning, Jordan.");
    expect(html).toContain("Tuesday, Nov 5");
    expect(html).toContain("Your learning day");
    expect(html).toContain("background-image:");
  });
});
