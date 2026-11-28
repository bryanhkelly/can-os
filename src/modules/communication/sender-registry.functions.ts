import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {scopeInput,changeInput,revokeInput,pageInput} from "./sender-registry.inputs";
export const readSenderAdministration=createServerFn({method:"GET"}).validator((input:unknown)=>scopeInput.parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).readSenderAdministration(data.organizationId);
});
export const changeSenderAdministration=createServerFn({method:"POST"}).validator((input:unknown)=>changeInput.parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).changeSenderAdministration(data);
});

export const revokeSenderAdministration=createServerFn({method:"POST"}).validator((input:unknown)=>revokeInput.parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).revokeSenderAdministration(data);
});

export const listSenderOrganizations=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).listSenderOrganizations();
});

export const listSenderOrganizationsPage=createServerFn({method:"GET"}).validator((input:unknown)=>pageInput.parse(input)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return (await import("./sender-registry.server")).listSenderOrganizationsPage(data);
});
