import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { renderFamilyBrandPage,renderFamilyBrandEmail } from "@/domain/school-brand-family";
import { readSiteFamilyBrand } from "@/modules/sites/site-family-brand.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requirePartnerWebsiteEditor } from "@/modules/sites/site-website-authorization.server";

const querySchema=z.object({
  siteId:z.string().uuid(),
  view:z.enum(["landing","survey","email-confirmation","email-update","email-survey"]),
}).strict();
const headers={
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"private, no-store",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "X-Robots-Tag":"noindex, nofollow",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function failure(status:number,reason:string){
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Brand preview unavailable</title></head>
 <body style="font:16px system-ui;margin:3rem auto;max-width:45rem;padding:1rem">
 <h1>Brand preview unavailable</h1><p>${reason}</p><a href="/access">Return to CAN OS</a></body></html>`,
 {status,headers});
}
/**
 * Read-only design system for all seven Site brands. No child/family data,
 * tokens, public routes, POST handlers, sending, or publication.
 */
export const Route=createFileRoute("/brand-preview")({
 server:{handlers:{
  GET:async({request})=>{
   const url=new URL(request.url);
   const input=querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
   if(!input.success)return failure(404,"Choose a school and preview from Website & Brand Studio.");
   let actor;
   try{actor=await getCommandContext(request)}
   catch(error){
    if(!(error instanceof AuthorizationError))return failure(503,"The sign-in service is temporarily unavailable.");
    const login=new URL("/access",url);
    login.searchParams.set("returnTo",url.pathname+url.search);
    return Response.redirect(login,302);
   }
   if(actor.grantSiteId!==input.data.siteId)return failure(403,"Switch to the authorized school membership.");
   try {
    const site=await requirePartnerWebsiteEditor(actor);
    if(site.id!==input.data.siteId)return failure(403,"School access is unavailable.");
    // Read only current safe Site brand tokens; no academic catalog, photo
    // collection or full Website Studio preview is needed for collateral.
    const context=await readSiteFamilyBrand(site.id);
    const selection=(name:string)=>{
      const href=new URL("/brand-preview",url);
      href.searchParams.set("siteId",input.data.siteId);
      href.searchParams.set("view",name);
      return href.pathname+href.search;
    };
    const kind=input.data.view;
    const rendered=kind==="landing"||kind==="survey"
      ?renderFamilyBrandPage(context,kind,{
        preview:true,requestId:crypto.randomUUID(),
        batchId:"00000000-0000-4000-8000-000000000000",
        recipientKey:"00000000-0000-4000-8000-000000000000",
        firstName:"Family",lastName:"Preview",email:"preview@example.invalid",
        landingHref:selection("landing"),surveyHref:selection("survey"),
      })
      :renderFamilyBrandEmail(context,kind==="email-update"?"update":kind==="email-survey"?"survey":"confirmation",{
        preview:true,firstName:"Family",actionUrl:new URL(selection("landing"),url).toString(),
      }).html;
    return new Response(rendered,{status:200,headers});
   }catch(error){
    if(error instanceof AuthorizationError)return failure(403,"Only the school administrator or authorized website editor may preview this brand.");
    console.error("Family brand preview failed",{operation:"brand_preview",errorType:error instanceof Error?error.name:"unknown"});
    return failure(503,"The school brand preview could not be loaded. Please try again.");
   }
  },
 }},
});
