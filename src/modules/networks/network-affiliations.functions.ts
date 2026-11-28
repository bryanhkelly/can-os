import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {empty,siteQuery,requestInput,reviewInput,withdrawInput,listAffiliationNetworksService,listSiteAffiliationsService,requestSiteAffiliationService,listNetworkAffiliationsService,reviewNetworkAffiliationService,withdrawSiteAffiliationService} from "./network-affiliations.server";
export const listAffiliationNetworks=createServerFn({method:"GET"}).handler(()=>{setResponseHeader("Cache-Control","private, no-store");return listAffiliationNetworksService(getRequest(),{});});
export const listSiteAffiliations=createServerFn({method:"GET"}).validator((v:unknown)=>siteQuery.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return listSiteAffiliationsService(getRequest(),data);});
export const requestSiteAffiliation=createServerFn({method:"POST"}).validator((v:unknown)=>requestInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return requestSiteAffiliationService(getRequest(),data);});
export const listNetworkAffiliations=createServerFn({method:"GET"}).handler(()=>{setResponseHeader("Cache-Control","private, no-store");return listNetworkAffiliationsService(getRequest(),{});});
export const reviewNetworkAffiliation=createServerFn({method:"POST"}).validator((v:unknown)=>reviewInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return reviewNetworkAffiliationService(getRequest(),data);});
export const withdrawSiteAffiliation=createServerFn({method:"POST"}).validator((v:unknown)=>withdrawInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return withdrawSiteAffiliationService(getRequest(),data);});
