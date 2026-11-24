import {createHash} from "node:crypto";
import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {siteGenerationTaskSchema,buildSiteGenerationInput} from "@/domain/site-content-generation";
import {readAuthorizedSiteContentBrief} from "./site-content-brief.server";
import {generateWithGloo} from "./gloo-content-provider.server";
const requestSchema=z.object({siteId:z.string().uuid(),task:siteGenerationTaskSchema}).strict();
async function prepare(data:z.infer<typeof requestSchema>){
  const actor=await getCommandContext(getRequest());
  if(actor.delegationMode==="view")throw new AuthorizationError("content generation requires authoring authority");
  const brief=await readAuthorizedSiteContentBrief(actor,data.siteId,data.task.target);
  const input=buildSiteGenerationInput(brief,data.task);
  const payload=JSON.stringify(input);
  if(new TextEncoder().encode(payload).byteLength>48000)throw new Error("Content input is too large. Remove optional context.");
  const digest=createHash("sha256").update(JSON.stringify({siteId:data.siteId,sourceRevisions:brief.sourceRevisions,input})).digest("hex");
  return {actor,input,digest,sourceRevisions:brief.sourceRevisions};
}
export const previewSiteGeneration=createServerFn({method:"POST"})
  .validator((value:unknown)=>requestSchema.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {input,digest,sourceRevisions}=await prepare(data);
    return {input,digest,sourceRevisions,provider:"gloo" as const};
  });
export const generateSiteContent=createServerFn({method:"POST"})
  .validator((value:unknown)=>requestSchema.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),externalProcessingConfirmed:z.literal(true)}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const before=await prepare(data);
    if(before.digest!==data.digest)throw new Error("Saved Site information changed. Review the new input before generation.");
    const result=await generateWithGloo(before.input);
    const after=await prepare(data);
    if(after.digest!==before.digest||after.actor.actorPersonId!==before.actor.actorPersonId)
      throw new Error("Site information or permissions changed. Generate again.");
    return {...result,provider:"gloo" as const,sourceRevisions:before.sourceRevisions,inputDigest:before.digest,promptVersion:before.input.promptVersion,generatedAt:new Date().toISOString(),status:"draft" as const};
  });
