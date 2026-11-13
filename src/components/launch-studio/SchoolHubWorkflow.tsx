import { SchoolConfigurationContextProvider, useSchoolConfigurationNavigation } from "./SchoolConfigurationContext";
import type { SchoolConfigurationContext } from "@/domain/school-configuration";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScopedAdminConsole } from "@/routes/admin";
import { LaunchWizardPage, type LaunchWizardData } from "@/components/operations/LaunchWizardPage";
import { LaunchAcademicSetupWorkspace } from "@/components/operations/LaunchAcademicSetupWorkspace";
import { SchoolOpeningEvidencePanel } from "@/components/operations/SchoolOpeningEvidencePanel";
import { LaunchPreparationWorkspace } from "@/components/operations/LaunchPreparationWorkspace";
import { SchoolProfileConfiguration } from "@/components/launch-studio/SchoolProfileConfiguration";
import { SiteInformationConfiguration } from "@/components/launch-studio/SiteInformationConfiguration";
import { ProgramDiscoveryPanel } from "@/components/launch-studio/ProgramDiscoveryPanel";
import type { LaunchDraftRecord } from "@/domain/launch-draft";
import type { LaunchJurisdictionResearch } from "@/domain/jurisdiction-launch-research";
import type { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";
import type { getSchoolHubData } from "@/modules/programs/school-hub.functions";
import type { OperationalSchoolHubModule } from "@/domain/school-launch-hub";
type Data=Awaited<ReturnType<typeof getSchoolHubData>> & {academic?:Awaited<ReturnType<typeof getLaunchAcademicSetup>>|null;academicFailed?:boolean;draft?:LaunchDraftRecord|null;draftFailed?:boolean;jurisdictionResearch?:Record<string,LaunchJurisdictionResearch>;jurisdictionResearchUnavailable?:boolean};
type WorkflowProps={data:Data;selection:{siteId?:string;programId?:string;teamMode?:"access"|"invite"|"people"};module:OperationalSchoolHubModule;context?:SchoolConfigurationContext};
export function SchoolHubWorkflow(props:WorkflowProps){return <SchoolConfigurationContextProvider value={props.context??"launch"}><SchoolHubWorkflowContent {...props}/></SchoolConfigurationContextProvider>;}
function SchoolHubWorkflowContent({data,selection,module}:WorkflowProps) {
 const navigation=useSchoolConfigurationNavigation();
 const router=useRouter();
 if(!selection.siteId)throw new Error("A school must be selected before opening an operational Launch module.");
 const siteId=selection.siteId;
 const status=data.statuses?.[module];
 const site=data.options.sites.find(item=>item.id===siteId);
 if(module==="profile")return site?<SchoolProfileConfiguration site={site}/>:<p role="alert" className="mt-6 border p-5">This school profile is unavailable in the current selection.</p>;
 if(module==="information")return site?<SiteInformationConfiguration key={`information:${site.updatedAt}`} site={site}/>:<p role="alert" className="mt-6 border p-5">Site information is unavailable in the current selection.</p>;
 if(module==="website")return <section className="mt-6 border bg-card p-6"><h2 className="font-serif text-3xl">Your school website</h2>
  <p className="mt-3 text-sm text-muted-foreground">Edit your school's saved website in Website Studio. Site-owned publishing and independent institutional approvals remain separate.</p>
  {status?.state==="Blocked" || status?.state==="Unavailable" ? <p role="status" className="mt-5 text-sm">{status.detail}</p> : <Button asChild className="mt-5"><Link to={navigation.websitePath} search={{siteId,returnToHub:navigation.context==="launch",returnToSettings:navigation.context==="settings"}}>Open Website &amp; Brand Studio →</Link></Button>}
 </section>;
 if(module==="team")return <section className="mt-6"><nav className="mb-4 flex flex-wrap gap-4" aria-label="School team views">{(["access","invite","people"] as const).map(mode=><Link key={mode} to={navigation.modulePath} params={{module:"team"}} search={{siteId,teamMode:mode}} className="inline-flex min-h-11 items-center border bg-card px-4 text-sm text-primary">{mode==="access"?"Members & permissions":mode==="invite"?"Invite team member":"People directory"}</Link>)}</nav><ScopedAdminConsole onChanged={()=>router.invalidate()} key={selection.teamMode??"access"} hubMode mode={selection.teamMode??"access"} selection={{siteId}}/></section>;
 if(!data.launches)return <p role="status" className="mt-6 border p-5">Program records are unavailable. <Button variant="outline" onClick={()=>void router.invalidate()}>Retry records</Button></p>;
 const current=data.launches.find(program=>program.id===data.selectedProgramId);
 if(data.selectionError || (data.launches.length && !current))return <section className="mt-6 border bg-card p-6"><h2 className="font-serif text-2xl">Choose a Program</h2><p className="mt-2 text-sm">Select the offering to configure or review. Each belongs to this school.</p>{data.selectionError&&<p role="alert" className="mt-3 text-sm">{data.selectionError}</p>}<div className="mt-4 grid gap-3">{data.launches.map(program=><Link key={program.id} to={navigation.modulePath} params={{module}} search={{siteId,programId:program.id}} className="border p-4 text-primary">{program.name} →</Link>)}</div>{data.selectionError&&<Link to={navigation.modulePath} params={{module}} search={{siteId}} className="mt-4 inline-flex min-h-11 items-center text-primary">Clear Program selection →</Link>}</section>;
 if(module==="academics") {
  const discovery=<ProgramDiscoveryPanel siteId={siteId}/>;
  if(current)return <>{discovery}{data.academic ? <LaunchAcademicSetupWorkspace key={current.id} hubMode data={data.academic}/> : <p role="alert" className="mt-6 border p-5">Academic records could not be loaded. <Button variant="outline" onClick={()=>void router.invalidate()}>Retry academic records</Button></p>}</>;
  if(data.draftFailed)return <>{discovery}<p role="alert" className="mt-6 border p-5">Your saved academic setup could not be loaded. <Button variant="outline" onClick={()=>void router.invalidate()}>Retry saved draft</Button></p></>;
    const wizardData:LaunchWizardData={options:{...data.options,canCreateSite:false,sites:data.options.sites.filter(item=>item.id===siteId),organizations:data.options.organizations.filter(org=>org.id===site?.organizationId)},launches:{launches:data.launches},preparationPrograms:[],familyInvitations:null,admissionsCounts:null,enrollmentCounts:null,extendedPlanning:null,jurisdictionGuidance:{},jurisdictionResearch:data.jurisdictionResearch??{},jurisdictionResearchUnavailable:data.jurisdictionResearchUnavailable,authError:"",draft:data.draft,draftContext:`${siteId}:`};
  return <>{discovery}<LaunchWizardPage hubMode selection={{siteId,step:"school"}} data={wizardData}/></>;
 }
 if(module==="compliance")return current ? <section className="mt-6"><LaunchPreparationWorkspace hubMode focus="readiness" currentLaunch={current} currentProgram={current} currentSchoolStatus={current.status} launches={data.launches} selection={{siteId,programId:current.id}} schoolSelection={{siteId,programId:current.id}} hasSchoolPreparation admissionsCounts={null} enrollmentCounts={null} familyInvitations={null}/><SchoolOpeningEvidencePanel key={current.id} programId={current.id}/></section> : <section className="mt-6 border bg-card p-6"><p>Create the first academic Program to resolve its applicable opening requirements.</p><Link to={navigation.modulePath} params={{module:"academics"}} search={{siteId}} className="mt-5 inline-flex min-h-11 items-center text-primary">Prepare academics →</Link></section>;
 // Exhaustive: every operational module must return its owning workflow.
 const unreachable:never=module;
 throw new Error(`Unrecognized operational school module: ${unreachable}`);
}
