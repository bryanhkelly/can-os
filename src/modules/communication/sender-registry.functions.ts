import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
const changeInput=z.object({
 from:z.string().trim().email().max(254),
 address:z.string().trim().min(1).max(500),
 reference:z.string().trim().min(5).max(500),
 expectedId:z.string().uuid().nullable(),
 confirmed:z.literal(true),
}).strict();
export const readSenderAdministration=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).readSenderAdministration();
});
export const changeSenderAdministration=createServerFn({method:"POST"}).validator((input:unknown)=>changeInput.parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).changeSenderAdministration(data);
});

export const revokeSenderAdministration=createServerFn({method:"POST"}).validator((input:unknown)=>z.object({expectedId:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).revokeSenderAdministration(data);
});
