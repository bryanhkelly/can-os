import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfileIdentity, ProfileMetricBand, ProfileRecordLayout, profileTabClass } from "./ProfileRecordLayout";
import { WorkspacePanel, StatusBadge, PersonMark } from "@/components/workspace";

const meta = { title:"V6.1 templates/Person and student profiles", parameters:{layout:"fullscreen"} } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const StudentCounselorView: Story = {render:()=> <div className="min-h-screen bg-background p-4 sm:p-8">
  <ProfileRecordLayout
    identity={<ProfileIdentity name="Caleb Rhodes" subtitle="Grade 12 · St. Jude Classical Austin · Illustrative record"
      portrait={<PersonMark name="Caleb Rhodes"/>}
      badges={<><StatusBadge>Student</StatusBadge><StatusBadge tone="attention">Intervention review</StatusBadge></>}
      actions={<a href="#appointments" className="border border-border px-4 py-2 text-xs font-semibold hover:bg-muted">Meetings →</a>}/>}
    metrics={[
      {id:"classes",label:"Active classes",value:3,detail:"Authorized sections"},
      {id:"missing",label:"Missing work",value:2,detail:"Follow-up may be needed"},
      {id:"absence",label:"Absences · 30 days",value:1,detail:"Recorded events"},
      {id:"actions",label:"Open actions",value:2,detail:"Authorized staff queue"},
    ]}
    navigation={<>
      <a href="#about" className={profileTabClass(true)}>About</a>
      <a href="#academic" className={profileTabClass(false)}>Academics</a>
      <a href="#attendance" className={profileTabClass(false)}>Attendance</a>
      <a href="#support" className={profileTabClass(false)}>Support & priorities</a>
      <a href="#family" className={profileTabClass(false)}>Family</a>
    </>}
    rail={<>
      <WorkspacePanel title="Meetings" description="Schedule from the authorized meeting service.">
        <div id="appointments" className="text-xs leading-5 text-muted-foreground">A booked meeting appears here only when returned by an authorized source. The screenshot's sample events are not production data.</div>
        <a href="#calendar" className="mt-4 block border border-border p-3 text-center text-xs font-semibold">Open calendar</a>
      </WorkspacePanel>
      <WorkspacePanel title="Quick links">
        <div className="grid gap-2 text-xs"><a href="#records" className="border p-3">Academic records</a><a href="#actions" className="border p-3">Open actions</a></div>
      </WorkspacePanel>
    </>}
  >
    <WorkspacePanel title="Student record summary" description="Verified academic information, not invented GPA or completion rates.">
      <ProfileMetricBand metrics={[{id:"current",label:"Finalized courses",value:2},{id:"active",label:"Active sections",value:3},{id:"support",label:"Support referrals",value:1}]}/>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Enrollment history, attendance, transcripts, intervention notes and meetings are shown only when supported by the owning services and this viewer's grants.</p>
    </WorkspacePanel>
    <WorkspacePanel title="Current classes">
      <div className="divide-y divide-border">
        {["Algebra II","English Literature","Biology"].map(name=><div key={name} className="py-3 text-sm font-semibold">{name}</div>)}
      </div>
    </WorkspacePanel>
  </ProfileRecordLayout>
</div>};

export const TeacherProfile: Story = {render:()=> <div className="max-w-6xl bg-background p-5">
  <ProfileRecordLayout identity={<ProfileIdentity name="Riley Example" subtitle="Teacher · Valor School"
    portrait={<PersonMark name="Riley Example"/>} badges={<StatusBadge>School-connected profile</StatusBadge>}/>}
    metrics={[{id:"sections",label:"Teaching sections",value:4,detail:"Current verified membership"}]}
    navigation={<a href="#sections" className={profileTabClass(true)}>Teaching assignments</a>}
    rail={<WorkspacePanel title="Profile context"><p className="text-xs text-muted-foreground">Private contact information and credentials remain protected.</p></WorkspacePanel>}>
    <WorkspacePanel title="Teaching assignments"><p className="text-sm">Active classes and section relationships are listed here.</p></WorkspacePanel>
  </ProfileRecordLayout>
</div>};

export const MinimalPersonProfile: Story = {render:()=> <div className="max-w-5xl bg-background p-5">
  <ProfileRecordLayout identity={<ProfileIdentity name="Avery Morgan" subtitle="Verified member" portrait={<PersonMark name="Avery Morgan"/>}/>}
    metrics={[]}><WorkspacePanel title="School connections"><p className="text-sm text-muted-foreground">No active school relationships in this membership.</p></WorkspacePanel>
  </ProfileRecordLayout>
</div>};
