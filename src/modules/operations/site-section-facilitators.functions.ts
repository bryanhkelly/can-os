import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { changeSectionFacilitator, listSectionFacilitators } from "./site-section-facilitators.server";
const uuid = z.string().uuid();
export const getSectionFacilitatorPlanning = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ programId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return listSectionFacilitators(await getCommandContext(getRequest()), data.programId);
  });

const setInput = z.object({
    sectionId: uuid, personId: uuid, action: z.enum(["appoint", "revoke"]),
    expectedAssignmentId: uuid.nullable(),
    validThrough: z.string().datetime({ offset: true }).optional(),
  }).strict().superRefine((data, ctx) => {
    if (data.action === "appoint" && !data.validThrough)
      ctx.addIssue({ code: "custom", message: "Delegation end time required" });
    if (data.action === "revoke" && data.validThrough)
      ctx.addIssue({ code: "custom", message: "Revoke cannot set new delegation date" });
  });
export type SectionFacilitatorInput = z.infer<typeof setInput>;

export const updateSectionFacilitator = createServerFn({ method: "POST" })
  .validator((value: unknown) => setInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return changeSectionFacilitator(await getCommandContext(getRequest()), data);
  });
