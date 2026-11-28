import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {createSiteInput,getNetworkSitesService,createNetworkSiteService} from "./network-sites.server";
export const getNetworkSites=createServerFn({method:"GET"}).handler(()=>getNetworkSitesService(getRequest()));
export const createNetworkSite=createServerFn({method:"POST"}).validator((input:unknown)=>createSiteInput.parse(input)).handler(({data})=>createNetworkSiteService(getRequest(),data));
