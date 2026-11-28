import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {rolesAllow} from "@/domain/school-roles";
import {parseCommandInput} from "@/domain/command-input";
import type {Actor} from "@/modules/identity/actors.server";
import * as input from "./curriculum-marketplace.inputs";
import {readMarketplace,readCurriculumAdopterPrograms,installPack,adoptPack,addCurriculumSupplement} from "./curriculum-marketplace.server";
import {readCurriculumJourneyReadiness} from "./curriculum-journey-readiness.server";
import {rolloverCurriculumAdoption,rollbackAnnualCurriculumAdoption,readAnnualAdoptionEligibility} from "./curriculum-year-adoption.server";
async function actor(request:Request):Promise<Actor>{
 const context=await getCommandContext(request);
 if(!context.actorPersonId||!rolesAllow(["registrar"],context.role))throw new AuthorizationError("registrar role");
 return context as Actor;
}
export async function getCurriculumAdopterProgramsService(request:Request,raw:unknown){
 parseCommandInput(input.empty,raw);
 return readCurriculumAdopterPrograms(await actor(request));
}
export async function getCurriculumJourneyReadinessService(request:Request,raw:unknown){
 const data=parseCommandInput(input.program,raw);
 return readCurriculumJourneyReadiness(await actor(request),data.programId);
}
export async function getCurriculumMarketplaceService(request:Request,raw:unknown){
 const data=parseCommandInput(input.program,raw);
 return readMarketplace(await actor(request),data.programId);
}
export async function installCurriculumPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.install,raw);
 return installPack(await actor(request),data);
}
export async function adoptCurriculumPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.adopt,raw);
 return adoptPack(await actor(request),data);
}
export async function reviewAnnualCurriculumAdoptionService(request:Request,raw:unknown){
 const data=parseCommandInput(input.annualReview,raw);
 return readAnnualAdoptionEligibility(await actor(request),data);
}
export async function rolloverAnnualCurriculumAdoptionService(request:Request,raw:unknown){
 const data=parseCommandInput(input.rollover,raw);
 return rolloverCurriculumAdoption(await actor(request),data);
}
export async function rollbackAnnualCurriculumPackAdoptionService(request:Request,raw:unknown){
 const data=parseCommandInput(input.rollback,raw);
 return rollbackAnnualCurriculumAdoption(await actor(request),data);
}
export async function addMarketplaceSupplementService(request:Request,raw:unknown){
 const data=parseCommandInput(input.supplement,raw);
 return addCurriculumSupplement(await actor(request),data);
}
