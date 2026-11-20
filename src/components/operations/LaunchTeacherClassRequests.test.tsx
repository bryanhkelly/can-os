import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunchTeacherClassRequests, type LaunchClassRequest } from "./LaunchTeacherClassRequests";

const request={
  id:"request-1",requesterName:"Instructor Example",
  requesterPersonId:"person-1",requestedCourseOrSubject:"DIG-101",
  requestedClassTitle:"Introduction to digital skills",desiredTerm:"Fall",
  schedulePreference:"Saturday",notes:"Digital literacy pilot",
} as unknown as LaunchClassRequest;

const base={
  requests:[request],busy:false,declineReasons:{},
  onPrepare:()=>{},onReasonChange:()=>{},onDecline:()=>{},
};
describe("shared teacher Class request review",()=>{
  it("keeps a teacher request distinct from a provisioned Class",()=>{
    const html=renderToStaticMarkup(<LaunchTeacherClassRequests {...base}/>);
    expect(html).toContain("Introduction to digital skills");
    expect(html).toContain("Prepare class setup");
    expect(html).toContain("does not create a Section");
    expect(html).toContain("Digital literacy pilot");
  });
  it("requires a meaningful recorded reason before declining",()=>{
    const html=renderToStaticMarkup(<LaunchTeacherClassRequests {...base}
      declineReasons={{"request-1":"bad"}}/>);
    expect(html).toContain("Decline request");
    expect(html).toContain("disabled");
  });
  it("preserves the empty queue state",()=>{
    const html=renderToStaticMarkup(<LaunchTeacherClassRequests {...base} requests={[]}/>);
    expect(html).toContain("No pending teacher class requests");
  });
});
