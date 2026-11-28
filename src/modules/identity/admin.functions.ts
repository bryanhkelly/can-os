import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {requireActor} from "./actors.server";
import {localStaffInviteInput} from "@/domain/staff-onboarding-policy";
import {listScopedSitesService,listPeopleService,listAccessAccountsService,inviteStaffMemberService,setGrantActiveService,staffPeopleQuery,staffGrantStateInput} from "./staff-admin.server";

const registrar=()=>requireActor(["registrar"],"admin.manage");
const noStore=()=>setResponseHeader("Cache-Control","private, no-store");

export const listScopedSites=createServerFn({method:"GET"}).handler(async()=>{
  noStore();return listScopedSitesService(await registrar());
});
export const listPeople=createServerFn({method:"GET"}).validator((raw:unknown)=>staffPeopleQuery.parse(raw??{})).handler(async({data})=>{
  noStore();return listPeopleService(await registrar(),data);
});
export const listAccessAccounts=createServerFn({method:"GET"}).handler(async()=>{
  noStore();return listAccessAccountsService(await registrar());
});
export const inviteStaffMember=createServerFn({method:"POST"}).validator((raw:unknown)=>localStaffInviteInput.parse(raw)).handler(async({data})=>{
  noStore();setResponseHeader("Referrer-Policy","no-referrer");
  return inviteStaffMemberService(await registrar(),getRequest(),data);
});
export const setGrantActive=createServerFn({method:"POST"}).validator((raw:unknown)=>staffGrantStateInput.parse(raw)).handler(async({data})=>{
  noStore();return setGrantActiveService(await registrar(),getRequest(),data);
});
