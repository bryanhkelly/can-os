import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import {
  createPublisherPack, createPublisherPackDraft, publishPublisherPack,
  readPublisherPackStudio, savePublisherPackDraft,
} from "./publisher-pack-authoring.server";

const uuid=z.string().uuid();
const program=z.object({programId:uuid}).strict();
const version=z.object({programId:uuid,versionId:uuid,expectedRevision:z.string().regex(/^[a-f0-9]{64}$/)});
const actor=()=>requireActor(["registrar"],"curriculum.publish");

export const getPublisherPackStudio=createServerFn({method:"GET"})
 .validator((input:unknown)=>program.parse(input))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readPublisherPackStudio(await actor(),data.programId);
 });

export const createAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({
  requestId:uuid,slug:z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/),
  name:z.string().trim().min(3).max(160),description:z.string().trim().min(10).max(2000),
  visibility:z.enum(["public","private"]),licenseCode:z.enum(["CC0","CC-BY-4.0","COMMERCIAL"]),
 }).parse(input))
 .handler(async({data})=>createPublisherPack(await actor(),data));

export const startPublisherPackDraft=createServerFn({method:"POST"})
 .validator((input:unknown)=>program.extend({packId:uuid,requestId:uuid}).parse(input))
 .handler(async({data})=>createPublisherPackDraft(await actor(),data));

export const saveAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>version.extend({courseVersionIds:z.array(uuid).min(1).max(200)}).strict().parse(input))
 .handler(async({data})=>savePublisherPackDraft(await actor(),data));

export const publishAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((input:unknown)=>version.extend({
  confirmed:z.literal(true),reason:z.string().trim().min(10).max(2000),
 }).strict().parse(input))
 .handler(async({data})=>publishPublisherPack(await actor(),data));
