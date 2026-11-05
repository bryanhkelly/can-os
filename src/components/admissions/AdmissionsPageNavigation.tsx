import { Link } from "@tanstack/react-router";
import { PageNavigation } from "@/components/workspace/page-navigation";

export type AdmissionsPageSelection={
 application?:string;siteId?:string;programId?:string;interest?:string;
 page?:number;studentPage?:number;search?:string;
};

/** Shared navigation for the authorized admissions and student-directory pages. */
export function AdmissionsPageNavigation({selection,hasMore,kind}:{
 selection:AdmissionsPageSelection;hasMore:boolean;kind:"applications"|"students";
}){
 const field=kind==="students"?"studentPage":"page";
 const current=selection[field]??1;
 const destination=kind==="students"?"/admissions/intake/new":"/admissions/intake";
 return <PageNavigation label={kind==="students"?"Existing student directory pages":"Admissions record pages"}
  className="my-3"
  previous={current>1&&<Link to={destination} search={{...selection,[field]:current-1}} className="underline">
   Previous {kind==="students"?"students":"applications"}
  </Link>}
  next={hasMore&&<Link to={destination} search={{...selection,[field]:current+1}} className="underline">
   Next {kind==="students"?"students":"applications"}
  </Link>}>
  <span>{kind==="students"?"Student directory":"Admissions"} page {current}</span>
 </PageNavigation>;
}
