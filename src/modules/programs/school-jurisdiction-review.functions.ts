import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSchoolJurisdictionReview } from "./school-jurisdiction-review.server";
import { ensureSchoolJurisdictionReviewAction } from "./school-jurisdiction-actions.server";

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
