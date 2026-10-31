import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,asc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {programs,sites} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";

/** School/program picker values are projected exclusively from the active grant. */
export const listAdmissionsPrograms=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId)throw new AuthorizationError("registrar admissions");
 assertCapability(actor,"enrollment.decide");
 const ids=actor.scope.programIds??[],siteIds=actor.scope.siteIds??[];
 if(!ids.length||!siteIds.length)return [];
 return db.select({id:programs.id,name:programs.name,type:programs.type,status:programs.status,siteId:sites.id,siteName:sites.name})
  .from(programs).innerJoin(sites,eq(sites.id,programs.siteId))
  .where(and(inArray(programs.id,ids),inArray(sites.id,siteIds)))
  .orderBy(asc(programs.name));
});
