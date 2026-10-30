import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const uuid=z.string().uuid();
const role=z.enum(["teacher","registrar"]);
const reason=z.string().trim().min(10).max(500);
const grant=z.object({programId:uuid,personId:uuid,role,reason}).strict();
const revoke=z.object({roleAssignmentId:uuid,reason}).strict();

export const listCANAcademicProgramStaffFn=createServerFn({method:"GET"})
  .validator((v:unknown)=>z.object({programId:uuid}).strict().parse(v))
  .handler(async({data})=>{
    const [{getCommandContext},{listCANAcademicProgramStaff}]=await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./can-academic-staff-delegation.server"),
    ]);
    return listCANAcademicProgramStaff(await getCommandContext(getRequest()),data.programId);
  });

export const delegateCANAcademicProgramStaffFn=createServerFn({method:"POST"})
  .validator((v:unknown)=>grant.parse(v))
  .handler(async({data})=>{
    const [{getCommandContext},{delegateCANAcademicProgramStaff}]=await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./can-academic-staff-delegation.server"),
    ]);
    return delegateCANAcademicProgramStaff(await getCommandContext(getRequest()),data);
  });

export const revokeCANAcademicProgramStaffFn=createServerFn({method:"POST"})
  .validator((v:unknown)=>revoke.parse(v))
  .handler(async({data})=>{
    const [{getCommandContext},{revokeCANAcademicProgramStaff}]=await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./can-academic-staff-delegation.server"),
    ]);
    return revokeCANAcademicProgramStaff(await getCommandContext(getRequest()),data);
  });
