import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./curriculum-marketplace.inputs";
import * as service from "./curriculum-marketplace-http.server";
export const getCurriculumAdopterPrograms=createServerFn({method:"GET"})
 
 .handler(async()=>{setResponseHeader("Cache-Control","private, no-store");return service.getCurriculumAdopterProgramsService(getRequest(),{});});

export const getCurriculumJourneyReadiness=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.program.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.getCurriculumJourneyReadinessService(getRequest(),data);});

export const getCurriculumMarketplace=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.program.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.getCurriculumMarketplaceService(getRequest(),data);});

export const installCurriculumPack=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.install.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.installCurriculumPackService(getRequest(),data);});

export const adoptCurriculumPack=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.adopt.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.adoptCurriculumPackService(getRequest(),data);});

export const reviewAnnualCurriculumAdoption=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.annualReview.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.reviewAnnualCurriculumAdoptionService(getRequest(),data);});

export const rolloverAnnualCurriculumAdoption=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.rollover.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.rolloverAnnualCurriculumAdoptionService(getRequest(),data);});

export const rollbackAnnualCurriculumPackAdoption=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.rollback.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.rollbackAnnualCurriculumPackAdoptionService(getRequest(),data);});

export const addMarketplaceSupplement=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.supplement.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.addMarketplaceSupplementService(getRequest(),data);});
