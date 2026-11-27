// Reuse the governed inventory. A reachable import is a review candidate,
// not evidence that an authenticated route renders a particular component.
const shared = /^src\/components\/(?:ui|workspace|workflow|evidence)\//;
const component = /^src\/components\/.*\.[jt]sx?$/;
const fixture = /\.(?:stories|test|spec)\.[jt]sx?$/;
const unique = items => [...new Set(items)].sort();
export function createImpactReport(inventory,registry){
 const declarations=new Map(registry.routes.map(row=>[row.path,row]));
 const routes=inventory.routes;
 const stories=inventory.storyDependencies??[];
 const modules=new Map();
 const ensure=path=>{
  if(!modules.has(path))modules.set(path,{path,shared:shared.test(path),routes:new Set(),storyFamilies:new Set()});
  return modules.get(path);
 };
 for(const file of inventory.inspected)if(component.test(file.path)&&!fixture.test(file.path))ensure(file.path);
 for(const route of routes){
  for(const path of route.reachableFiles??[])if(component.test(path)&&!fixture.test(path))ensure(path).routes.add(route.file);
 }
 for(const story of stories){
  for(const path of story.reachableFiles??[])if(component.test(path)&&!fixture.test(path))ensure(path).storyFamilies.add(story.file);
 }
 const records=[...modules.values()].map(item=>{
  const routePaths=unique(item.routes),storyFamilies=unique(item.storyFamilies);
  const registeredStoryRefs=unique(routePaths.flatMap(path=>declarations.get(path)?.stories??[]));
  const matchingStoryRefs=registeredStoryRefs.filter(ref=>item.storyFamilies.has(ref.split("#")[0]));
  return {path:item.path,shared:item.shared,routeCount:routePaths.length,storyFamilyCount:storyFamilies.length,routePaths,storyFamilies,registeredStoryRefs,matchingStoryRefs,
   routesWithoutLinkedFamily:routePaths.filter(path=>!(declarations.get(path)?.stories??[]).some(ref=>item.storyFamilies.has(ref.split("#")[0])))};
 }).sort((a,b)=>b.routeCount-a.routeCount||a.path.localeCompare(b.path));
 const audit=new Map(inventory.inspected.map(file=>[file.path,file]));
 const debt=path=>{
  const file=audit.get(path);
  return file ? {native:file.native.length,corners:file.corners.length,appearance:file.appearance.length,syntax:file.syntaxErrors.length}:null;
 };
 const affected=routes.map(route=>{
  const row=declarations.get(route.file);
  return {path:route.file,layout:row?.layout??null,review:row?.review??"unregistered",linkedStories:row?.stories??[],
   direct:debt(route.file),reachable:unique((route.reachableFiles??[]).filter(path=>{const counts=debt(path);return counts&&Object.values(counts).some(Boolean);})).map(path=>({path,...debt(path)}))};
 }).sort((a,b)=>a.path.localeCompare(b.path));
 return {kind:"v61-static-impact-inventory",routeCount:routes.length,storyFamilyCount:stories.length,componentModuleCount:records.length,
  sharedModules:records.filter(row=>row.shared).length,
  sharedWithoutStoryFamilies:records.filter(row=>row.shared&&row.routeCount>0&&!row.storyFamilyCount).length,
  components:records,routes:affected,
  limitations:["Static local module reachability, not JSX render counts or authenticated journey acceptance.","Named re-exports follow requested symbols; dynamic or unresolved imports may be omitted and barrel side effects can overstate reachability.","A story family importing a module does not prove a particular exported story exercises it. Registered links and inferred matches remain separate."]};
}
