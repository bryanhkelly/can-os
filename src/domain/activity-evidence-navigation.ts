import { shortUuidHref } from "@/domain/opaque-url-id";
import type {ParticipationRecord} from "./participation-read-model";

/** Secondary navigation to source-owned outcomes. Links are NOT entitlements:
 * every destination rechecks the active CAN/canonical Person, grant, and
 * original enrollment or relationship. A historical receipt never reopens
 * revoked curriculum or Class materials.
 */
export type ActivityEvidenceLink={label:string;href:string};
export function activityEvidenceLinks(
 record:ParticipationRecord,viewerRole:string,
):ActivityEvidenceLink[]{
 const links:ActivityEvidenceLink[]=[];
 if(record.source==="school_section"){
  const section=record.refs.sectionId;
  if(viewerRole==="student"&&record.subject.kind==="self"){
   if(section)links.push({label:"Assignments & feedback",
      href:"/student/assignments?section="+encodeURIComponent(section)});
   links.push({label:"Academic grades & transcript",href:"/student/report-card"});
  }else if(viewerRole==="guardian"&&record.subject.kind==="dependent"){
   const child=record.refs.studentPersonId;
   if(section)links.push({label:"Authorized dependent's work",
      href:"/guardian/students?"+(child?"student="+encodeURIComponent(child)+"&":"")+
        "section="+encodeURIComponent(section)});
   links.push({label:"Attendance & excuses",
      href:child?"/guardian/attendance?student="+encodeURIComponent(child):"/guardian/attendance"});
  }
 }
 if(record.source==="native_class"&&record.status==="active"&&
    record.subject.kind==="self"&&record.refs.classId){
  const prefix=shortUuidHref("/class/", record.refs.classId);
  links.push({label:"Assessments",href:prefix+"?view=learn&tab=assignments"});
  links.push({label:"Session attendance",href:prefix+"?view=learn&tab=sessions"});
 }
 if(record.source==="noncredit_course"&&
    record.subject.kind==="self"&&record.status==="completed"){
  links.push({label:"Issued certificates & badges",
    href:"/canonical/my-credentials"});
 }
 return links;
}
