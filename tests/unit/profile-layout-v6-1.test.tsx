import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileIdentity, ProfileMetricBand, ProfileRecordLayout, profileTabClass } from "@/components/profiles/ProfileRecordLayout";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { ProfileMeetingsPanel, ProfileLinksPanel } from "@/components/profiles/ProfileContextPanels";

describe("V6.1 identity-first profile composition", () => {
  it("puts the selected student's identity ahead of metrics and record sections", () => {
    const html=renderToStaticMarkup(<ProfileRecordLayout
      identity={<ProfileIdentity name="Caleb Rhodes" subtitle="Grade 12" badges={<span>Priority review</span>}/>}
      metrics={[{id:"classes",label:"Active classes",value:3},
        {id:"missing",label:"Missing work",value:2}]}
      navigation={<a href="?tab=attendance" className={profileTabClass(false)}>Attendance</a>}
      rail={<p>Calendar and related links</p>}>
      <section>Finalized grades</section>
    </ProfileRecordLayout>);
    expect(html).toContain('<h1');
    expect(html.indexOf("Caleb Rhodes")).toBeLessThan(html.indexOf("Active classes"));
    expect(html.indexOf("Active classes")).toBeLessThan(html.indexOf("Finalized grades"));
    expect(html).toContain('aria-label="Profile sections"');
    expect(html).toContain('href="?tab=attendance"');
    expect(html).toContain('aria-label="Profile meetings and related actions"');
  });

  it("does not invent a metric when no authorized source supplies one", () => {
    const html=renderToStaticMarkup(<ProfileMetricBand metrics={[]}/>);
    expect(html).not.toContain("GPA");
    expect(html).not.toContain("attendance rate");
  });

  it("renders only authorized appointment facts and safe empty states", () => {
    const empty=renderToStaticMarkup(<ProfileMeetingsPanel meetings={[]}/>);
    expect(empty).toContain("No meetings are available in this view");
    expect(empty).not.toContain("<time");
    const populated=renderToStaticMarkup(<ProfileMeetingsPanel meetings={[
      {id:"m1",title:"Academic check-in",startsAt:"2026-11-06T16:00:00Z",displayTime:"Nov 6, 8:00 AM PST"},
    ]}/>);
    expect(populated).toContain("Academic check-in");
    expect(populated).toContain('dateTime="2026-11-06T16:00:00Z"');
    const links=renderToStaticMarkup(<ProfileLinksPanel links={[{id:"history",title:"Transcript",href:"/records"}]}/>);
    expect(links).toContain('href="/records"');
  });

  it("suppresses the generic workspace h1 when the profile supplies its own", () => {
    const html=renderToStaticMarkup(<WorkspaceShell title="Caleb Rhodes" contentHeader>
      <ProfileIdentity name="Caleb Rhodes"/>
    </WorkspaceShell>);
    expect((html.match(/<h1/g)??[]).length).toBe(1);
    expect(html).toContain('aria-label="Caleb Rhodes"');
  });

  it("keeps the default workspace heading for other routes", () => {
    const html=renderToStaticMarkup(<WorkspaceShell title="Student directory"><p>Directory</p></WorkspaceShell>);
    expect(html).toContain("Student directory");
    expect((html.match(/<h1/g)??[]).length).toBe(1);
  });
});
