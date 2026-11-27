// Shared pure policy; operate on resolved runtime modules, not erased type imports.
export function fixtureImportViolation(id) {
 const path=id.replaceAll("\\","/").split("?")[0].replace(/^\0/,"");
 if(/(?:^|\/node_modules\/)(?:@tanstack\/(?:react-start-server|start-server-core)(?:\/|$)|@tanstack\/react-start\/(?:dist\/[^/]+\/)?server(?:\.[cm]?[jt]s)?(?:\/|$))/.test(path))return "server-only application dependency";
 if(path.includes("/node_modules/"))return null;
 const local=path.startsWith("@/")?"src/"+path.slice(2):path.startsWith("src/")?path:path.includes("/src/")?path.slice(path.lastIndexOf("/src/")+1):null;
 if(!local)return null;
 if(/^src\/(?:db|server|workers|routes)(?:\/|$)/.test(local)||/\.server(?:\.[cm]?[jt]sx?)?(?:\/|$)/.test(local))return "server-only application code";
 if(/^src\/modules\//.test(local)&&/\.functions(?:\.[cm]?[jt]sx?)?$/.test(local)&&!local.includes("/__mocks__/"))return "unmocked application RPC";
 return null;
}
