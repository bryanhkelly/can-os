import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";

/** One user-facing starting idea. Published Programs and broad learning ideas
 * remain different persisted concepts and neither implies a Solution/Offering. */
export function selectedStartingIdeaV61(plan:SiteProgramsAudiencesV61):string{
  if(plan.startingProgramCode && plan.programCodes?.includes(plan.startingProgramCode))
    return "program:"+plan.startingProgramCode;
  if(plan.startingFocus && plan.interestIds.includes(plan.startingFocus))
    return "interest:"+plan.startingFocus;
  return "";
}

export function chooseStartingIdeaV61(
  plan:SiteProgramsAudiencesV61,value:string,
):SiteProgramsAudiencesV61{
  if(!value)return {...plan,startingProgramCode:null,startingFocus:null};
  if(value.startsWith("program:")){
    const code=value.slice(8);
    if(!plan.programCodes?.includes(code))
      throw new Error("Choose a selected published Program.");
    return {...plan,startingProgramCode:code,startingFocus:null};
  }
  if(value.startsWith("interest:")){
    const id=value.slice(9) as SiteProgramsAudiencesV61["interestIds"][number];
    if(!plan.interestIds.includes(id))
      throw new Error("Choose a selected learning interest.");
    return {...plan,startingProgramCode:null,startingFocus:id};
  }
  throw new Error("Unknown starting idea.");
}
