import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar";
import { workspaceLinks } from "@/components/shell/workspace-navigation.registry";
import { StudentExperience } from "./StudentExperience";
import type { StudentDashboardData } from "./student-dashboard-data";

const now = new Date("2030-11-05T15:00:00Z");
const dashboard: StudentDashboardData = {
  assignments: { ok:true, data:[
    { assessmentId:"essay", sectionId:"english", title:"Comparing two arguments", course:"English", dueAt:"2030-11-06T17:00:00Z",
      status:"assigned", timeliness:"on_time", assessmentStatus:"published", canEdit:true, hasDraft:false },
    { assessmentId:"draft", sectionId:"algebra", title:"Linear equations practice", course:"Algebra II", dueAt:"2030-11-08T17:00:00Z",
      status:"assigned", timeliness:"on_time", assessmentStatus:"published", canEdit:true, hasDraft:true },
    { assessmentId:"feedback", sectionId:"algebra", title:"Expressions reflection", course:"Algebra II", dueAt:null,
      status:"graded", timeliness:"on_time", assessmentStatus:"closed", canEdit:false, hasDraft:false },
  ] },
  learning: { ok:true, data:{ sectionId:"algebra", title:"Algebra II", lesson:{id:"linear",title:"Solving linear equations",estimatedMinutes:25},completed:3,total:8 } },
  grades: { ok:true, data:[
    { sectionGradeId:"algebra-grade",sectionTitle:"Algebra II",schoolYearName:"2030–31",gradingPeriodName:"First quarter",letterGrade:"B+",percentage:"88" },
    { sectionGradeId:"english-grade",sectionTitle:"English",schoolYearName:"2030–31",gradingPeriodName:"First quarter",letterGrade:"A",percentage:"94" },
  ] },
  community: { ok:true, data:{connected:true, events:[
    { id:"service",title:"Community service afternoon",startsAt:"2030-11-08T18:00:00Z",timezone:"America/New_York",status:"scheduled" },
    { id:"club",title:"Student creative arts gathering",startsAt:"2030-11-09T18:00:00Z",timezone:"America/New_York",status:"scheduled" },
  ], notices:[{id:"notice",title:"This week's school update",body:"Review the upcoming service schedule with your school.",acknowledged:false}] } },
};
const meta = {
  title:"Student/Refined dashboard",
  component:StudentExperience,
  parameters:{layout:"fullscreen"},
  args:{
    liveData:{
      student:{studentProfileId:"synthetic-student",personId:"synthetic-person",firstName:"Jordan",preferredName:null,gradeLevel:"10"},
      generatedAt:now,dayStartUtc:new Date("2030-11-05T05:00:00Z"),dayEndUtc:new Date("2030-11-06T05:00:00Z"),
      sections:[
        {sectionId:"algebra",sectionTitle:"Algebra II",siteId:"school",timezone:"America/New_York",programId:"academic",schoolYearId:"year"},
        {sectionId:"english",sectionTitle:"English",siteId:"school",timezone:"America/New_York",programId:"academic",schoolYearId:"year"},
      ],
      events:[{id:"class-event",title:"Algebra II",description:"Room 204",type:"class_session",startsAt:new Date("2030-11-05T15:30:00Z"),
        endsAt:new Date("2030-11-05T16:15:00Z"),timezone:"America/New_York",siteId:"school",sectionId:"algebra",sourceType:null,cancelled:false}],
      coursework:[],openActions:[],recoveryCandidates:[],hasEnrollmentGuardian:true,firstWeek:[],
    },
    dashboard,
  },
  decorators:[Story=>{
    const root=createRootRoute({component:()=> <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <WorkspaceSidebar member={{role:"student",firstName:"Jordan",lastName:"Learner",siteId:"school"}}
        sites={[{id:"school",name:"Synthetic acceptance school"}]} links={workspaceLinks.student} activePath="/student" />
      <div className="min-w-0"><header className="border-b bg-card px-6 py-4 text-xs">Student workspace · Synthetic browser fixture</header><Story /></div>
    </div>});
    return <RouterProvider router={createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/"]})})} />;
  }],
} satisfies Meta<typeof StudentExperience>;
export default meta;
type Story=StoryObj<typeof meta>;

export const LiveShapedData: Story = {
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole("heading",{level:1})).toHaveTextContent("Good morning, Jordan.");
    await expect(canvas.getByRole("link",{name:/Resume Lesson/})).toHaveAttribute("href","/classes?section=algebra&tab=lessons&lesson=linear");
    await expect(canvas.getByRole("progressbar")).toHaveAttribute("aria-valuenow","3");
    const filter=canvas.getByRole("button",{name:"In progress"});
    filter.focus();
    await userEvent.keyboard("{Enter}");
    await expect(filter).toHaveAttribute("aria-pressed","true");
    await expect(canvas.queryByText("Comparing two arguments")).not.toBeInTheDocument();
    await expect(canvas.getByRole("link",{name:/Linear equations practice/})).toHaveAttribute("href","/student/assignments?section=algebra&assessment=draft");
    await userEvent.click(canvas.getByRole("button",{name:"All"}));
    await expect(canvas.getByText("Comparing two arguments")).toBeVisible();
    await expect(canvas.getByRole("link",{name:"Next month"})).toHaveAttribute("href","/calendar?date=2030-12-01&view=month");
    await expect(canvas.getByRole("link",{name:"Previous month"})).toHaveAttribute("href","/calendar?date=2030-10-01&view=month");
    await expect(canvas.getByRole("link",{name:"Tuesday, November 5, 2030"})).toHaveAttribute("aria-current","date");
  },
};
export const Empty: Story = {
  args:{dashboard:{
    assignments:{ok:true,data:[]},learning:{ok:true,data:null},grades:{ok:true,data:[]},
    community:{ok:true,data:{connected:true,events:[],notices:[]}},
  }},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByText("No finalized grades yet. Released grades appear here after school review.")).toBeVisible();
    await expect(canvas.getByText("No upcoming school events are published.")).toBeVisible();
    await expect(canvas.queryByRole("progressbar")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link",{name:/Resume Lesson/})).not.toBeInTheDocument();
  },
};
export const IndependentFailures: Story = {
  args:{dashboard:{
    ...dashboard,
    assignments:{ok:false,message:"This information is temporarily unavailable.",authError:null},
    learning:{ok:false,message:"This information is temporarily unavailable.",authError:null},
    grades:{ok:false,message:"You do not have permission to view this page.",authError:"You do not have permission to view this page."},
  }},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole("heading",{name:"Today's Schedule"})).toBeVisible();
    await expect(canvas.getByText("This week's school update")).toBeVisible();
    await expect(canvas.queryByText(/No finalized grades yet/)).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link",{name:/Resume Lesson/})).not.toBeInTheDocument();
  },
};
export const MoreThanTwentyFivePriorities: Story = {
  args:{dashboard:{
    ...dashboard,
    assignments:{ok:true,data:Array.from({length:30},(_,index)=>({
      assessmentId:`due-${index}`,sectionId:"algebra",title:`Due assignment ${index+1}`,course:"Algebra II",dueAt:"2030-11-06T17:00:00Z",
      status:"assigned",timeliness:"on_time",assessmentStatus:"published",canEdit:true,hasDraft:false,
    }))},
  }},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole("button",{name:"Due soon"}));
    await expect(canvas.getByText("Showing 5 of 30. Open all assignments for the complete list.")).toBeVisible();
  },
};
