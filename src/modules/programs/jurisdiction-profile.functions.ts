import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {reviewInput,verificationInput,publicationInput} from "./jurisdiction-profile.inputs";
import * as service from "./jurisdiction-profile.server";
export const listJurisdictionProfileReviews=createServerFn({method:"GET"}).handler(()=>service.listJurisdictionProfileReviewsService(getRequest()));
export const listPublishedJurisdictionGuidance=createServerFn({method:"GET"}).handler(()=>service.listPublishedJurisdictionGuidanceService(getRequest()));
export const saveJurisdictionProfileReview=createServerFn({method:"POST"}).validator((value:unknown)=>reviewInput.parse(value)).handler(({data})=>service.saveJurisdictionProfileReviewService(getRequest(),data));
export const verifyJurisdictionProfileReview=createServerFn({method:"POST"}).validator((value:unknown)=>verificationInput.parse(value)).handler(({data})=>service.verifyJurisdictionProfileReviewService(getRequest(),data));
export const publishJurisdictionProfile=createServerFn({method:"POST"}).validator((value:unknown)=>publicationInput.parse(value)).handler(({data})=>service.publishJurisdictionProfileService(getRequest(),data));
