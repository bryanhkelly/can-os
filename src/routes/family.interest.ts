import { createFileRoute } from "@tanstack/react-router";
import { invitedFamilyInterestInput, familySurveyFields, summarizeFamilySurvey } from "@/domain/family-recruitment-interest";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";
import { renderFamilyBrandPage, renderFamilyBrandEmail } from "@/domain/school-brand-family";
import { hasConfiguredPublicOrigin, publicHtmlResponse } from "@/lib/public-html-response.server";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { z } from "zod";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const brandedHeaders={
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "X-Robots-Tag":"noindex, nofollow",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
function html(body:string,status=200){
  return publicHtmlResponse(body,{title:"School information · CAN",maxWidth:"38rem",status});
}
function unavailable(){
  return html("<h1>Information request unavailable</h1><p>Ask the school that invited you for a current link.</p>",404);
}
function configuredOrigin(request:Request){
  return hasConfiguredPublicOrigin(request,{localPreviewPath:"/family/interest"});
}
function publicResponse(body:string):Response {
  return new Response(body,{status:200,headers:brandedHeaders});
}
/**
 * The original private invitation's batch and recipient keys remain the only
 * route to a family page. Both pages use the current saved Site brand and
 * retain independently checked adult consent, expiry and Program scope.
 * This is NOT a public Site publication or application route.
 */
export const Route=createFileRoute("/family/interest")({
  server:{handlers:{
    GET:async({request})=>{
      if(!configuredOrigin(request))return unavailable();
      const url=new URL(request.url);
      const batchId=url.searchParams.get("invitationBatchId")??"";
      const recipientKey=url.searchParams.get("invitationRecipientKey")??"";
      if(!uuid.test(batchId)||!uuid.test(recipientKey))return unavailable();
      try {
        const {readPreopeningFamilyWelcome}=
          await import("@/modules/enrollment/family-invitations.server");
        const context=await readPreopeningFamilyWelcome(batchId,recipientKey);
        const landingHref=new URL(url);
        landingHref.searchParams.delete("view");
        const surveyHref=new URL(landingHref);
        surveyHref.searchParams.set("view","survey");
        const kind=url.searchParams.get("view")==="survey"?"survey":"landing";
        return publicResponse(renderFamilyBrandPage({
          ...context.brand,introduction:context.introduction,
          informationOnly:context.programStatus==="active",
          events:context.events,
        },kind,{
          preview:false,requestId:crypto.randomUUID(),batchId,recipientKey,
          firstName:context.invitedFamily.firstName,
          lastName:context.invitedFamily.lastName,
          email:context.invitedFamily.email,
          landingHref:landingHref.pathname+landingHref.search,
          surveyHref:surveyHref.pathname+surveyHref.search,
        }));
      }catch(error){
        if(error instanceof AuthorizationError || error instanceof z.ZodError ||
          (error instanceof DomainError && error.code==="UNAVAILABLE"))return unavailable();
        console.error("Branded family interest landing failed",{kind:"unexpected"});
        return html("<h1>School information temporarily unavailable</h1><p>Please try again shortly.</p>",503);
      }
    },
    POST:async({request})=>{
      if(!configuredOrigin(request) ||
        request.headers.get("origin")!==new URL(request.url).origin)return unavailable();
      let parsed:z.infer<typeof invitedFamilyInterestInput>;
      try {
        const params=await readSmallUrlEncodedBody(request);
        const responseKind=params.get("responseKind")==="survey"?"survey":"landing";
        const survey=responseKind==="survey"?familySurveyFields.parse({
          grades:params.get("grades"),
          priority:params.get("priority"),
          learningPace:params.get("learningPace"),
          contactPreference:params.get("contactPreference"),
          comments:params.get("comments")??"",
        }):null;
        parsed=invitedFamilyInterestInput.parse({
          requestId:params.get("requestId"),
          invitationBatchId:params.get("invitationBatchId"),
          invitationRecipientKey:params.get("invitationRecipientKey"),
          firstName:params.get("firstName"),
          lastName:params.get("lastName"),
          email:params.get("email"),
          message:survey?summarizeFamilySurvey(survey):params.get("message")??"",
          purpose:"information",
          contactConsent:params.get("contactConsent"),
          website:params.get("website")??"",
          responseKind,
          ...(survey?{contactPreference:survey.contactPreference}:{}),
        });
      }catch{
        return html("<h1>Unable to receive your response</h1><p>Check the form and try again.</p>",400);
      }
      try{
        const {admitPublicAdmissionsInterest,recordInvitedFamilyInterest}=
          await import("@/modules/enrollment/public-admissions-interest.server");
        const budget=await admitPublicAdmissionsInterest("invited_family_interest");
        if(!budget.allowed)return html("<h1>Please try again shortly</h1><p>Too many requests were received.</p>",429);
        await recordInvitedFamilyInterest(parsed);
        const followUpAllowed=parsed.responseKind!=="survey"||parsed.contactPreference!=="none";
        // No implicit contact consent from receiving the original invitation.
        // Confirmation is sent only after this adult affirmatively responds.
        if(followUpAllowed && !parsed.website){
          try{
            const [{readPreopeningFamilyWelcome},{sendNotificationEmail},{isDemoTenantOrganization}]=
              await Promise.all([
                import("@/modules/enrollment/family-invitations.server"),
                import("@/modules/communication/notification-email.server"),
                import("@/modules/identity/demo-school-tenants.server"),
              ]);
            const context=await readPreopeningFamilyWelcome(parsed.invitationBatchId,parsed.invitationRecipientKey);
            if(!await isDemoTenantOrganization(context.organizationId)){
              const url=new URL("/family/interest",request.url);
              url.searchParams.set("invitationBatchId",parsed.invitationBatchId);
              url.searchParams.set("invitationRecipientKey",parsed.invitationRecipientKey);
              const template=renderFamilyBrandEmail({ ...context.brand,
                informationOnly:context.programStatus==="active",
              },"confirmation",{
                firstName:parsed.firstName,actionUrl:url.toString(),
              });
              await sendNotificationEmail({
                to:parsed.email,subject:template.subject,html:template.html,text:template.text,
              },`family-interest:${parsed.invitationBatchId}:${parsed.invitationRecipientKey}:confirmation`);
            }
          }catch{
            // Persistence succeeds independently of optional email delivery.
            console.warn("Family interest confirmation could not be delivered",{kind:"provider_unavailable"});
          }
        }
        return html(parsed.responseKind==="survey"
          ?"<h1>Thank you for your feedback.</h1><p>Your survey response was saved. The school may follow up only if you requested it. This is not an application or an enrollment offer.</p>"
          :"<h1>Thank you for your interest.</h1><p>Your school information request was received. This is not an application, school opening approval or enrollment confirmation.</p>");
      }catch(error){
        if(error instanceof AuthorizationError ||
          (error instanceof DomainError&&error.code==="UNAVAILABLE"))return unavailable();
        console.error("Branded family response failed",{kind:"unexpected"});
        return html("<h1>Unable to receive your response</h1><p>Please try again shortly.</p>",503);
      }
    },
  }},
});
