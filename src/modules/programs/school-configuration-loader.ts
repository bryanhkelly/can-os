import { getSchoolHubData } from "./school-hub.functions";
import { getLaunchAcademicSetup } from "./launch-academics.functions";
import { getLaunchStudioDraft } from "./launch-drafts.functions";
import { safeLoader } from "@/lib/safe-loader";
/** Shared, read-only composition for Launch and Settings. No records are copied. */
export async function loadSchoolConfiguration(selection:{siteId?:string;programId?:string},module:string){
 const data=await getSchoolHubData({data:{siteId:selection.siteId,programId:selection.programId,
    module:module as "profile"|"information"|"website"|"team"|"promote"|"recruitment"|"events"|"academics"|"compliance"}});
 const academic=module==="academics" && data.selectedProgramId
  ? await safeLoader(()=>getLaunchAcademicSetup({data:{programId:data.selectedProgramId!}}))():null;
 const draft=module==="academics" && selection.siteId && data.launches?.length===0
  ? await safeLoader(()=>getLaunchStudioDraft({data:{audience:"school",context:`${selection.siteId}:`}}))():null;
 return {...data,academic:academic?.ok?academic.data:null,academicFailed:academic!==null&&!academic.ok,draft:draft?.ok?draft.data:null,draftFailed:draft!==null&&!draft.ok};
}
