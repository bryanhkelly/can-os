import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { listEligibleCourseClasses } from "./course-class-placement.server";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";

/** Public choices are scoped to the already-authorized, published Course
 * release. This is a preview only: registration revalidates under locks. */
export const getAvailableClassesForCourseRegistration=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({
    releaseId:z.string().uuid(),
  }).strict().parse(value))
  .handler(async({data})=>{
    return db.transaction(async tx=>{
      const [release]=await readEligibleSelfEnrollmentReleases(tx,data.releaseId);
      if(!release)return [];
      return listEligibleCourseClasses(tx,release,new Date());
    });
  });
