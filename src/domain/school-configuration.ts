import { schoolHubModules } from "./school-launch-hub";
export type SchoolConfigurationContext="launch"|"settings";
export const schoolSettingsModules={
  profile:{title:"School Profile",description:"School identity, location, contact and time zone."},
  information:{...schoolHubModules.information},
  website:{...schoolHubModules.website,title:"Website"},
  team:{...schoolHubModules.team,title:"Team & Permissions"},
  promote:{...schoolHubModules.promote,title:"Promotion"},
  recruitment:{...schoolHubModules.recruitment,title:"Recruitment"},
  events:{...schoolHubModules.events,title:"Events"},
  academics:{...schoolHubModules.academics,title:"Academics"},
  compliance:{...schoolHubModules.compliance,title:"Compliance"},
} as const;
export type SchoolSettingsModule=keyof typeof schoolSettingsModules;
export function schoolConfigurationNavigation(context:SchoolConfigurationContext){
 return context==="settings"
  ? {context,homePath:"/settings" as const,modulePath:"/settings/school/$module" as const,homeLabel:"School Settings",websitePath:"/launch/website" as const}
  : {context,homePath:"/launch/hub/school" as const,modulePath:"/launch/hub/school/$module" as const,homeLabel:"Launch Hub",websitePath:"/launch/website" as const};
}
