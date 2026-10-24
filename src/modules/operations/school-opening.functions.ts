import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const uuid=z.string().uuid();
const read=z.object({programId:uuid}).strict();
const decide=read.extend({
  decision:z.enum(["approve","suspend"]),
  reason:z.string().trim().min(10).max(500),
}).strict();

export const getChurchSchoolOpeningFn=createServerFn({method:"GET"})
  .validator((input:unknown)=>read.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const [{getCommandContext},{readChurchSchoolOpening}]=await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./school-opening.server"),
    ]);
    return readChurchSchoolOpening(await getCommandContext(getRequest()),data.programId);
  });

export const decideChurchSchoolOpeningFn=createServerFn({method:"POST"})
  .validator((input:unknown)=>decide.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const [{getCommandContext},{decideChurchSchoolOpening}]=await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./school-opening.server"),
    ]);
    return decideChurchSchoolOpening(await getCommandContext(getRequest()),data);
  });
