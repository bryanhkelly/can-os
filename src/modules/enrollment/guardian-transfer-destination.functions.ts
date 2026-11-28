import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {listPublicTransferDestinationsService,requestTransferDestinationFamilyStartService,transferDestinationInput} from "./guardian-transfer-destination.server";
export const listPublicTransferDestinations=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return listPublicTransferDestinationsService(getRequest());
});
export const requestTransferDestinationFamilyStart=createServerFn({method:"POST"}).validator((raw:unknown)=>transferDestinationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return requestTransferDestinationFamilyStartService(getRequest(),data);
});
