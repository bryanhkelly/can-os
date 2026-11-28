import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {releaseInput,decisionInput,publishInput,assetSubmissionInput,policyInput,
  getNativeOfferingReleaseOverviewService,
  submitNativeOfferingReleaseService,
  getNativeOfferingReleasePolicyReviewService,
  saveNativeOfferingReleasePolicyService,
  getNativeOfferingReleaseReviewQueueService,
  getNativeOfferingReviewContentService,
  decideNativeOfferingReleaseService,
  publishNativeOfferingCoursesService,
  approveNativeOfferingAssetManifestService,
  publishNativeOfferingVersionService
} from "./native-offering-release.server";
const uuid=z.string().uuid();
export const getNativeOfferingReleaseOverview=createServerFn({method:"GET"})
  .validator((raw:unknown)=>releaseInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return getNativeOfferingReleaseOverviewService(await getCommandContext(getRequest()),data);
  });

export const submitNativeOfferingRelease=createServerFn({method:"POST"})
  .validator((raw:unknown)=>assetSubmissionInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return submitNativeOfferingReleaseService(await getCommandContext(getRequest()),data);
  });

export const getNativeOfferingReleasePolicyReview=createServerFn({method:"GET"})
  .validator((raw:unknown)=>releaseInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return getNativeOfferingReleasePolicyReviewService(await getCommandContext(getRequest()),data);
  });

export const saveNativeOfferingReleasePolicy=createServerFn({method:"POST"})
  .validator((raw:unknown)=>policyInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return saveNativeOfferingReleasePolicyService(await getCommandContext(getRequest()),data);
  });

export const getNativeOfferingReleaseReviewQueue=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    cursor:z.object({createdAt:z.string().datetime({offset:true}),id:uuid}).strict().nullable(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return getNativeOfferingReleaseReviewQueueService(await getCommandContext(getRequest()),data);
  });

export const getNativeOfferingReviewContent=createServerFn({method:"GET"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return getNativeOfferingReviewContentService(await getCommandContext(getRequest()),data);
  });

export const decideNativeOfferingRelease=createServerFn({method:"POST"})
  .validator((raw:unknown)=>decisionInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return decideNativeOfferingReleaseService(await getCommandContext(getRequest()),data);
  });

export const publishNativeOfferingCourses=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return publishNativeOfferingCoursesService(await getCommandContext(getRequest()),data);
  });

export const approveNativeOfferingAssetManifest=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return approveNativeOfferingAssetManifestService(await getCommandContext(getRequest()),data);
  });

export const publishNativeOfferingVersion=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    return publishNativeOfferingVersionService(await getCommandContext(getRequest()),data);
  });
