import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { courseTemplates, organizations } from "@/db/schema";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "@/modules/learning/curriculum-marketplace.server";

/** Read-only previews: no adoption, entitlement or academic authorization. */
export const getDemoCurriculumPreview = createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({programId:z.string().uuid()}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await requireActor(["registrar"]);
  await readMarketplace(actor,data.programId);
  const courses=await db.select({
   code:courseTemplates.code,title:courseTemplates.title,
   subject:courseTemplates.subject,description:courseTemplates.description,
  }).from(courseTemplates)
   .innerJoin(organizations,eq(organizations.id,courseTemplates.owningOrganizationId))
   .where(and(eq(organizations.slug,"can-demo-publisher"),
    sql`${courseTemplates.metadata}->>'sourceSystem' = 'can-demo-catalog-factory'`))
   .orderBy(asc(courseTemplates.subject),asc(courseTemplates.title));
  return {courses,synthetic:true as const,adoptionAllowed:false as const};
 });
