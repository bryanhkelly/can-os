import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import {
  beginSchoolOpeningEvidenceUploadSchema, finishSchoolOpeningEvidenceUploadSchema,
  reviewSchoolOpeningEvidenceSchema, schoolOpeningEvidenceDownloadSchema,
} from "@/domain/school-opening-evidence";

async function contextAndService() {
  const [{getCommandContext},service]=await Promise.all([
    import("@/modules/identity/command-context.server"),
    import("./school-opening-evidence.server"),
  ]);
  return {actor:await getCommandContext(getRequest()),service};
}

export const beginSchoolOpeningEvidenceUploadFn=createServerFn({method:"POST"})
  .validator((input:unknown)=>beginSchoolOpeningEvidenceUploadSchema.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {actor,service}=await contextAndService();
    return service.beginSchoolOpeningEvidenceUpload(actor,data);
  });

export const finishSchoolOpeningEvidenceUploadFn=createServerFn({method:"POST"})
  .validator((input:unknown)=>finishSchoolOpeningEvidenceUploadSchema.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {actor,service}=await contextAndService();
    return service.finishSchoolOpeningEvidenceUpload(actor,data);
  });

export const reviewSchoolOpeningEvidenceFn=createServerFn({method:"POST"})
  .validator((input:unknown)=>reviewSchoolOpeningEvidenceSchema.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {actor,service}=await contextAndService();
    return service.reviewSchoolOpeningEvidence(actor,data);
  });

export const getSchoolOpeningEvidenceDownloadFn=createServerFn({method:"POST"})
  .validator((input:unknown)=>schoolOpeningEvidenceDownloadSchema.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {actor,service}=await contextAndService();
    return service.getSchoolOpeningEvidenceDownload(actor,data);
  });
