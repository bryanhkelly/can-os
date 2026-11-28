import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {createSurveyDraftInput} from "@/domain/canonical-survey-draft";
export const readCanonicalSurveyDraftAccess=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./canonical-survey-draft.server");return service.readCanonicalSurveyDraftAccess(getRequest());});
export const createCanonicalSurveyDraft=createServerFn({method:"POST"}).validator((raw:unknown)=>createSurveyDraftInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./canonical-survey-draft.server");return service.createCanonicalSurveyDraft(getRequest(),data);});
