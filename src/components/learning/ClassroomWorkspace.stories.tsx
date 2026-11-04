import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { useState, type ReactNode } from "react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ClassContent } from "@/domain/class-content";
import { DomainError } from "@/domain/errors";
import { WorkspacePanel } from "@/components/workspace";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { workspaceLinks } from "@/components/shell/workspace-navigation.registry";
import { ClassroomWorkspace } from "./ClassroomWorkspace";
import { ClassLessonOutline } from "./ClassLessonOutline";
import { ClassroomLessonTabs } from "./ClassroomLessonTabs";
import { ClassroomMediaStage } from "./ClassroomMediaStage";
import { PublishedLessonContent } from "./PublishedLessonContent";
import { ClassVideoPlayer, ClassVideoPlaceholder } from "./ClassVideoPlayer";

const sectionId = "11111111-1111-4111-8111-111111111111";
const content: ClassContent = { version: 1, syllabus: "", resources: [], modules: [
  { id: "equations", title: "Linear equations", lessons: [
    { id: "balance", title: "Keeping an equation balanced", body: "Use the same operation on both sides of an equation.", resources: [] },
    { id: "solve", title: "Solving linear equations", body: "Start by isolating the variable. Show each step, then substitute your answer to check it.",
      resources: [], estimatedMinutes: 20, learningTargets: ["Solve an equation and explain each transformation."],
      transcript: "An equation stays balanced when both sides receive the same operation.",
      activities: [{ id: "practice", title: "Try it yourself", kind: "guided_practice", instructions: "Solve 3x + 5 = 20. Explain your first step and check your solution.", evidence: "practice" }] },
  ] },
] };
const lesson = content.modules[0]!.lessons[1]!;

function ClassroomFrame({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={`classroom-navigation ${expanded ? "classroom-navigation-expanded" : ""}`}>
    <WorkspaceSidebar focused expanded={expanded} onToggle={() => setExpanded(value => !value)}
      member={{ role: "student" }} links={workspaceLinks.student} activePath="/classes"/>
    <div className="min-w-0">{children}</div>
  </div>;
}
const meta = {
  title: "Learning/Focused classroom",
  component: ClassroomWorkspace,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Algebra II", lessonTitle: lesson.title, subtitle: "ALG-2 · Mathematics · Synthetic Storybook fixture",
    lessonPosition: { current: 2, total: 2 },
    metadata: <><span><strong>Teacher</strong> · Synthetic assigned teacher</span><span><strong>Estimated</strong> · 20 min</span></>,
    rail: <><ClassLessonOutline content={content} search={{ section: sectionId }} currentLessonId={lesson.id}
      completed={new Set(["balance"])} showCompletion/>
      <WorkspacePanel title="Next step"><p className="text-sm">Complete the guided practice and check your work.</p></WorkspacePanel></>,
    children: <div className="grid grid-cols-1 gap-5">
      <ClassroomMediaStage sectionId={sectionId} role="student" timezone="America/New_York" meetings={{ ok: true, data: [] }}
        commands={{ get: async () => [], schedule: async () => { throw new DomainError("FORBIDDEN"); }, saveLink: async () => { throw new DomainError("FORBIDDEN"); } }}
        recorded={<ClassVideoPlayer title="CC0 playback example (not an algebra lesson)"
          url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" presentation="classroom"/>}/>
      <ClassroomLessonTabs materials={<PublishedLessonContent lesson={lesson}/>}
        transcript={<p className="whitespace-pre-wrap text-sm leading-8">{lesson.transcript}</p>}
        notes={<p role="status" className="text-sm">Notes persistence is not connected in this isolated visual fixture.</p>}
        discussion={<p className="text-sm text-muted-foreground">No lesson discussion has been opened.</p>}/>
    </div>,
  },
  decorators: [Story => {
    const root = createRootRoute({ component: () => <ClassroomFrame><Story/></ClassroomFrame> });
    return <RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) })}/>;
  }],
} satisfies Meta<typeof ClassroomWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Lesson: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = canvas.getByRole("complementary", { name: "Workspace sidebar" });
    await expect(sidebar).not.toHaveTextContent("Jordan Learner");
    await expect(canvas.getByRole("heading", { level: 1, name: "Algebra II" })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 2, name: lesson.title })).toBeVisible();
  },
};
export const UnavailableCurriculum: Story = { args: {
  lessonTitle: undefined,
  lessonPosition: undefined,
  rail: <ClassLessonOutline content={null} search={{ section: sectionId }} completed={new Set()} showCompletion/>,
  children: <div className="grid grid-cols-1 gap-5">
    <ClassroomMediaStage sectionId={sectionId} role="student" timezone="America/New_York" meetings={{ok:true,data:[]}}
      commands={{get:async()=>[],schedule:async()=>{throw new DomainError("FORBIDDEN");},saveLink:async()=>{throw new DomainError("FORBIDDEN");}}}
      recorded={<ClassVideoPlaceholder title="No class recording yet" message="No recording has been attached to this class."/>}/>
    <ClassroomLessonTabs materials={<p role="status">No published lesson content is available. Assignments remain in their usual workspace.</p>}
      transcript={<p>No transcript is available.</p>} notes={<p>Private notes require a published lesson and deployed notes migration.</p>}/>
  </div>,
} };
