import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  createCapacityOffering,
  createInstructorAvailability,
  createInstructorCapability,
  findCapacityCandidates,
  getInstructorCapacity,
  releaseInstructionalCapacity,
  reserveInstructionalCapacity,
  replaceCommittedCapacity,
  upsertSectionCapacityDemand,
} from "./educational-capacity-service";

const uuid = z.string().uuid();

export const createCapacityCapability = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    personId: uuid,
    courseTemplateId: uuid.nullish(),
    subject: z.string().trim().min(1).nullish(),
    gradeRange: z.object({ min: z.string().optional(), max: z.string().optional() }).optional(),
    modalities: z.array(z.string().min(1)).optional(),
  }).parse(v))
  .handler(async ({ data }) => createInstructorCapability(await getCommandContext(getRequest()), data));

export const createCapacityAvailability = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    personId: uuid,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().min(1),
    weeklyPattern: z.object({
      days: z.array(z.number().int().min(0).max(6)).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }).nullish(),
  }).parse(v))
  .handler(async ({ data }) => createInstructorAvailability(await getCommandContext(getRequest()), {
    ...data,
    startsAt: new Date(data.startsAt),
    endsAt: new Date(data.endsAt),
  }));

export const createInstructionalCapacityOffering = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    personId: uuid,
    capabilityId: uuid,
    availabilityWindowId: uuid,
    modality: z.enum(["onsite", "live_online", "asynchronous", "hybrid"]),
    maxSeats: z.number().int().positive(),
    organizationId: uuid.nullish(),
    siteId: uuid.nullish(),
    programId: uuid.nullish(),
    jurisdictionId: uuid.nullish(),
  }).parse(v))
  .handler(async ({ data }) => createCapacityOffering(await getCommandContext(getRequest()), data));

export const saveSectionCapacityDemand = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    sectionId: uuid,
    expectedSeats: z.number().int().positive(),
    modality: z.enum(["onsite", "live_online", "asynchronous", "hybrid"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }).parse(v))
  .handler(async ({ data }) => upsertSectionCapacityDemand(await getCommandContext(getRequest()), {
    ...data,
    startsAt: new Date(data.startsAt),
    endsAt: new Date(data.endsAt),
  }));

export const getCapacityCandidates = createServerFn({ method: "GET" })
  .validator((v: unknown) => z.object({ demandId: uuid }).parse(v))
  .handler(async ({ data }) => findCapacityCandidates(await getCommandContext(getRequest()), data.demandId));

export const holdCapacity = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    demandId: uuid,
    offeringId: uuid,
    seats: z.number().int().positive().optional(),
    status: z.enum(["held", "committed"]).optional(),
    expiresAt: z.string().datetime().nullish(),
  }).parse(v))
  .handler(async ({ data }) => {
    const expiresAt =
      typeof data.expiresAt === "string" ? new Date(data.expiresAt) : data.expiresAt;
    return reserveInstructionalCapacity(await getCommandContext(getRequest()), {
      ...data,
      expiresAt,
    });
  });

export const releaseCapacity = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ reservationId: uuid }).parse(v))
  .handler(async ({ data }) => releaseInstructionalCapacity(await getCommandContext(getRequest()), data.reservationId));

export const getPersonCapacity = createServerFn({ method: "GET" })
  .validator((v: unknown) => z.object({ personId: uuid }).parse(v))
  .handler(async ({ data }) => getInstructorCapacity(await getCommandContext(getRequest()), data.personId));

export const swapCommittedInstructor=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({reservationId:uuid,replacementOfferingId:uuid,reason:z.string().trim().min(5).max(1000)}).parse(v))
 .handler(async({data})=>replaceCommittedCapacity(await getCommandContext(getRequest()),data));
