import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  changeSiteParentIdentityReview, getSiteParentIdentityReview,
  publicIdentityReviewInput,
} from "./site-parent-identity-review.server";

const scope=z.object({siteId:z.string().uuid()}).strict();

export const getPublicParentIdentityReview=createServerFn({method:"GET"})
  .validator((value:unknown)=>scope.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return getSiteParentIdentityReview(
      await getCommandContext(getRequest()),data.siteId);
  });

export const setPublicParentIdentityReview=createServerFn({method:"POST"})
  .validator((value:unknown)=>publicIdentityReviewInput.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return changeSiteParentIdentityReview(
      await getCommandContext(getRequest()),data);
  });
