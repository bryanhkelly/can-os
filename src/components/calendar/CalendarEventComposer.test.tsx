import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarEventComposer, type CalendarComposerFields } from "./CalendarEventComposer";

vi.mock("@/components/ui/modal", () => ({
  Modal: ({children,open}: {children:ReactNode;open:boolean})=>
    open ? <div>{children}</div> : null,
}));
vi.mock("./CalendarInviteesPicker", () => ({
  CalendarInviteesPicker: ()=><div>Authorized invitee selection</div>,
}));
vi.mock("@/components/workspace/mutation-feedback", () => ({
  MutationFeedback: () => null,
}));

const form:CalendarComposerFields={
  title:"Learning gathering",description:"Community education",
  date:"2026-11-19",start:"16:00",end:"17:00",timezone:"America/Los_Angeles",
};
const defaults={
  open:true,busy:false,attempted:false,error:"",
  mutation:{pending:false,refreshFailed:false} as never,
  form,initialFocus:{current:null},invitees:{} as never,
  selectedInviteeCount:2,inviteGroupCount:0,
  onClose:()=>{},onSubmit:()=>{},onFieldChange:()=>{},
};

describe("controlled calendar event composer", () => {
  it("renders localized draft data and reuses authorized invitees", () => {
    const html=renderToStaticMarkup(<CalendarEventComposer {...defaults}/>);
    expect(html).toContain("Learning gathering");
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("Authorized invitee selection");
    expect(html).toContain("Create event");
  });
  it("keeps the create command disabled when either recipient cap is exceeded", () => {
    for(const extra of [{selectedInviteeCount:101},{inviteGroupCount:51}]){
      const html=renderToStaticMarkup(<CalendarEventComposer {...defaults} {...extra}/>);
      expect(html).toMatch(/disabled[^>]*>Create event/);
    }
  });
  it("displays validation before attempted submission without manufacturing an event", () => {
    const html=renderToStaticMarkup(<CalendarEventComposer {...defaults}
      attempted={true} form={{...form,title:"A",end:"15:00"}}/>);
    expect(html).toContain("Enter a title with at least 3 characters");
    expect(html).toContain("Choose an end after the start");
  });
});
