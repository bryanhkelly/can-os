import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {updateLaunchSiteAddressInput,updateLaunchSiteAddressService,updateLaunchSiteContactInput,updateLaunchSiteContactService,updateLaunchSiteInformationInput,updateLaunchSiteInformationService,updateLaunchSiteIdentityInput,updateLaunchSiteIdentityService,getLaunchSiteConfigurationInput,getLaunchSiteConfigurationService} from "./site-configuration.server";
export const updateLaunchSiteAddress=createServerFn({method:"POST"}).validator((raw:unknown)=>updateLaunchSiteAddressInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return updateLaunchSiteAddressService(getRequest(),data);
});
export const updateLaunchSiteContact=createServerFn({method:"POST"}).validator((raw:unknown)=>updateLaunchSiteContactInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return updateLaunchSiteContactService(getRequest(),data);
});
export const updateLaunchSiteInformation=createServerFn({method:"POST"}).validator((raw:unknown)=>updateLaunchSiteInformationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return updateLaunchSiteInformationService(getRequest(),data);
});
export const updateLaunchSiteIdentity=createServerFn({method:"POST"}).validator((raw:unknown)=>updateLaunchSiteIdentityInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return updateLaunchSiteIdentityService(getRequest(),data);
});
export const getLaunchSiteConfiguration=createServerFn({method:"GET"}).validator((raw:unknown)=>getLaunchSiteConfigurationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return getLaunchSiteConfigurationService(getRequest(),data);
});
