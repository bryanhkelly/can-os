// Normalize Storybook index identities once for inventory and browser acceptance.
export const normalizeStoryPath=path=>String(path??"").replaceAll("\\","/").replace(/^\.\//,"");
export const storyExportSlug=name=>String(name??"").replace(/([a-z0-9])([A-Z])/g,"$1-$2").replace(/([A-Z])([A-Z][a-z])/g,"$1-$2").toLowerCase();
export function matchesStoryExport(entry,name){
 return Boolean(name)&&entry.type==="story"&&(entry.exportName?entry.exportName===name:String(entry.id??"").endsWith("--"+storyExportSlug(name)));
}
export function findStoryEntry(entries,{path,title,exportName}){
 if(!exportName||(!path&&!title))return undefined;
 const matches=entries.filter(entry=>(!path||normalizeStoryPath(entry.importPath)===normalizeStoryPath(path))&&(!title||entry.title===title)&&matchesStoryExport(entry,exportName));
 // Ambiguous entries are not valid evidence of a registered story.
 return matches.length===1?matches[0]:undefined;
}

// Checks the actual generated Storybook index, not only the source inventory.
export function checkStorybookIndex(index,registry){
 const errors=[];
 if(!index?.entries||typeof index.entries!=="object")return {stories:0,docs:0,errors:["Storybook index entries are missing"]};
 const entries=Object.values(index.entries);
 const stories=entries.filter(entry=>entry.type==="story");
 const docs=entries.filter(entry=>entry.type==="docs");
 const refs=[...new Set([...Object.values(registry.layoutReferences??{}),...(registry.routes??[]).flatMap(row=>row.stories??[])])];
 for(const ref of refs){
  const [path,name]=ref.split("#");
  if(!findStoryEntry(stories,{path,exportName:name}))errors.push("Registry story missing from built catalog: "+ref);
 }
 for(const title of ["00 Start here/Welcome","05 Page layouts/Choosing a layout","04 Application patterns/Interaction contract","12 Engineering and acceptance/Authoring standards","12 Engineering and acceptance/Release gates"]){
  if(!docs.some(entry=>entry.title===title))errors.push("Required guide missing: "+title);
 }
 if(!stories.length)errors.push("No rendered stories in index");
 const groups={};
 for(const entry of stories){const group=entry.title.split("/")[0];groups[group]=(groups[group]??0)+1;}
 return {stories:stories.length,docs:docs.length,registeredReferences:refs.length,groups,errors};
}
