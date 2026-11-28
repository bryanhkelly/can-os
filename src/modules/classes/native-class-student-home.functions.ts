import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { readStudentClasses } from "./native-class-student-home.server";

/** Temporary UI transport; shares the same business implementation as HTTP. */
export const getMyStudentClasses=createServerFn({method:"GET"}).handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
  let actor:Awaited<ReturnType<typeof getIdentityContext>>;
  try {actor=await getIdentityContext(getRequest());}
  catch(error){
    if(error instanceof AuthorizationError)return {kind:"other" as const,classes:[]};
    throw error;
  }
  return readStudentClasses(actor);
});
