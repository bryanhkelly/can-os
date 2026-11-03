import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSchoolJurisdictionReview } from "./school-jurisdiction-review.server";
import { ensureSchoolJurisdictionReviewAction, decideSchoolJurisdictionLegalReview } from "./school-jurisdiction-actions.server";

/** Internal launch reader; never usable by anonymous Site hosts. */
export const getSchoolJurisdictionReview = createServerFn({method:"GET"})
  .validator((value:unknown) =>
    z.object({programId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data}) => {
    const actor=await getCommandContext(getRequest());
    return readSchoolJurisdictionReview(actor,data.programId);
  });

/** Creates an existing Action request for CAN review, never a legal approval. */
export const requestSchoolJurisdictionLegalReview = createServerFn({method:"POST"})
  .validator((value:unknown) =>
    z.object({programId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return ensureSchoolJurisdictionReviewAction(actor,data.programId);
  });

/** CAN-only independent decision. The server recomputes the authoritative
 * Site/Program scope and verifies the source version inside a locked transaction. */
export const reviewSchoolJurisdictionLegally = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    programId:z.string().uuid(),
    expectedScopeFingerprint:z.string().min(10).max(200),
    expectedSiteRevision:z.string().datetime({offset:true}),
    decision:z.enum(["verify","request_changes"]),
    note:z.string().trim().min(25).max(2000),
    sourceUrls:z.array(z.string().url().startsWith("https://")).max(30),
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    return decideSchoolJurisdictionLegalReview(actor,data);
  });
