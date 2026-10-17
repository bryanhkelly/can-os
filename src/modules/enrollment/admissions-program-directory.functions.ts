import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,asc,inArray} from "drizzle-orm";
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
 return db.select({id:programs.id,name:programs.name,siteId:programs.siteId,siteName:sites.name})
  .from(programs).innerJoin(sites,and(
   inArray(sites.id,siteIds),
   // The program must belong to a site authorized by this grant.
   inArray(programs.siteId,siteIds),
  ))
  .where(inArray(programs.id,ids))
  .orderBy(asc(programs.name));
});
