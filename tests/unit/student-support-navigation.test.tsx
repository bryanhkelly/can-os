import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/student.support";

const state=vi.hoisted(()=>({
 actions:[
  {id:"recovery",title:"Revise your essay",description:"Read the feedback",type:"student_recovery",subjectType:"assessment",subjectId:"essay",status:"open"},
  {id:"support",title:"Meet your mentor",description:null,type:"student_support",subjectType:"student_profile",subjectId:"student",status:"in_progress"},
  {id:"request",title:"Help with schoolwork",description:"Please help",type:"student_support_request",subjectType:"student_profile",subjectId:"student",status:"open"},
  {id:"conference",title:"Conference next steps",description:null,type:"conference_follow_up",subjectType:"conference_booking",subjectId:"booking",status:"resolved"},
  {id:"other",title:"Private referral",description:null,type:"support_referral",subjectType:"student_profile",subjectId:"student",status:"open"},
 ],
}));

vi.mock("@tanstack/react-router",async importOriginal=>({
 ...await importOriginal<typeof import("@tanstack/react-router")>(),
 Link:({to,search,children,...props}:{to:string;search?:Record<string,string>;children:ReactNode})=>
  <a href={to+(search?"?"+new URLSearchParams(search).toString():"")} {...props}>{children}</a>,
 createFileRoute:()=>(options:object)=>({
  options,
  useSearch:()=>({}),
  useLoaderData:()=>({ok:true,data:{viewerRole:"student",actions:state.actions}}),
 }),
 useRouter:()=>({invalidate:vi.fn()}),
}));
vi.mock("@/modules/actions/student-actions.functions",()=>({
 getQuickWinActions:vi.fn(),requestQuickWinHelp:vi.fn(),
}));
vi.mock("@/modules/support/support-referrals.functions",()=>({
 advanceSupportReferral:vi.fn(),createSupportReferral:vi.fn(),getSupportReferrals:vi.fn(),
 getSupportViewerRole:vi.fn(),listTeacherReferralStudents:vi.fn(),saveSupportPlan:vi.fn(),
 scheduleSupportService:vi.fn(),completeSupportService:vi.fn(),
}));

function renderSupport(){
 const Page=Route.options.component!;
 return renderToStaticMarkup(<Page/>);
}

describe("student support action navigation",()=>{
 beforeEach(()=>vi.clearAllMocks());

 it("links assessment-backed recovery titles and review controls to the exact assignment",()=>{
  const html=renderSupport();
  expect(html).toMatch(/href="\/student\/assignments\?assessment=essay"[^>]*>Revise your essay<\/a>/);
  expect(html).toMatch(/href="\/student\/assignments\?assessment=essay"[^>]*>Review assignment/);
  expect(html).not.toContain('href="/student/experiences?action=recovery"');
 });

 it.each([
  ["support","Meet your mentor"],
  ["request","Help with schoolwork"],
  ["conference","Conference next steps"],
 ])("links %s to its exact saved-action detail, not a staff referral", (id,title)=>{
  const html=renderSupport();
  expect(html).toContain(`href="/student/experiences?action=${id}" class="hover:underline">${title}</a>`);
  expect(html).toContain(`href="/student/experiences?action=${id}" class="mt-3 inline-block text-sm underline">Review action`);
  expect(html).not.toContain("Private referral");
  expect(html).not.toContain("?referral=");
 });

 it("shows the existing empty state without adding unrelated action links",()=>{
  const actions=state.actions;
  state.actions=[];
  try{
   const html=renderSupport();
   expect(html).toContain("No support actions recorded yet.");
   expect(html).not.toContain("Review action");
   expect(html).not.toContain("Review assignment");
  }finally{state.actions=actions;}
 });
});
