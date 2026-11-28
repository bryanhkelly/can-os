declare module "virtual:becomuna-engineering-inventory" {
  type ImpactComponent = {
    path:string; shared:boolean; routeCount:number; storyFamilyCount:number;
    routePaths:string[]; storyFamilies:string[]; registeredStoryRefs:string[];
    matchingStoryRefs:string[]; routesWithoutLinkedFamily:string[];
  };
  type Debt = {native:number;corners:number;appearance:number;syntax:number};
  type ImpactRoute = {
    path:string;layout:string|null;review:string;linkedStories:string[];
    direct:Debt|null;reachable:(Debt&{path:string})[];
  };
  const snapshot:{
    schemaVersion:1;designSystem:"V6.1";source:{commit:string;clean:boolean};
    impact:{kind:string;routeCount:number;storyFamilyCount:number;componentModuleCount:number;
      sharedModules:number;sharedWithoutStoryFamilies:number;
      components:ImpactComponent[];routes:ImpactRoute[];limitations:string[]};
  };
  export default snapshot;
}
