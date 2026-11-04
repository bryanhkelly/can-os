import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserFlowMap } from "./user-flow-map";

const meta = { title: "V6.1 templates/Process and user-flow maps", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ChurchToSchoolLaunch: Story = { render: () => <div className="bg-background p-4 sm:p-8">
  <UserFlowMap title="Church-to-school launch journey"
    description="Document a cross-role process before implementation. Stages and branches are read-only: actual decisions are server-owned."
    stages={[
      { id: "discover", title: "Engage and configure", description: "Church and CAN onboarding", nodes: [
        { id: "interest", title: "Church expresses interest", kind: "entry", state: "complete", owner: "Church partner" },
        { id: "partner", title: "Verify organization and operating agreement", kind: "review", state: "active", owner: "CAN" },
        { id: "site", title: "Configure location and programs", kind: "task", state: "not_started", owner: "Site administrator" },
      ] },
      { id: "prepare", title: "Prepare and verify", description: "Independent institutional requirements", nodes: [
        { id: "public", title: "Draft family-facing information", kind: "task", state: "not_started", owner: "Website editor" },
        { id: "evidence", title: "Review staffing, supervision and jurisdiction evidence", kind: "review", state: "not_started", owner: "Authorized reviewer" },
        { id: "approved", title: "Are opening requirements met?", kind: "decision", state: "blocked", owner: "CAN opening officer", description: "No progress percentage can substitute for an authorization decision" },
      ] },
      { id: "operate", title: "Open and operate", description: "Conditional on separate approval", nodes: [
        { id: "open", title: "Record approved opening decision", kind: "exit", state: "not_started", owner: "CAN opening officer" },
        { id: "families", title: "Communicate with families", kind: "task", state: "not_started", owner: "Site team" },
        { id: "day", title: "Operate the supervised day", kind: "task", state: "not_started", owner: "Site team" },
      ] },
    ]}
    transitions={[
      { from: "interest", to: "partner", outcome: "Church qualifies for review", condition: "Verified organization" },
      { from: "approved", to: "evidence", outcome: "Evidence rejected", condition: "Re-review is required; no opening granted" },
      { from: "approved", to: "open", outcome: "Approved", condition: "Independent CAN opening authority confirms current evidence" },
    ]}
    legend={<p className="text-xs text-muted-foreground">Example use: discovery workshops, implementation handoff, testing scenarios and role boundary reviews. This visualization does not mutate any record or authorize a school opening.</p>}
  />
</div> };

export const StudentLearningJourney: Story = { render: () => <div className="bg-background p-4 sm:p-8">
  <UserFlowMap title="Student completes an assignment" description="Role-level journey from class entry to released feedback."
    stages={[
      { id: "entry", title: "Find work", nodes: [
        { id: "home", title: "Open Today", kind: "entry", state: "complete", owner: "Student" },
        { id: "due", title: "Select assignment", kind: "task", state: "active", owner: "Student" },
      ] },
      { id: "doing", title: "Complete work", nodes: [
        { id: "learn", title: "Review assignment instructions", kind: "task", state: "not_started" },
        { id: "send", title: "Submit work", kind: "decision", state: "not_started", owner: "Student", description: "Submission receipt is distinct from grading" },
      ] },
      { id: "feedback", title: "Receive feedback", nodes: [
        { id: "grade", title: "Teacher reviews submission", kind: "review", state: "not_started", owner: "Teacher" },
        { id: "release", title: "Released feedback visible to student", kind: "exit", state: "not_started", owner: "Teacher" },
      ] },
    ]} />
</div> };
