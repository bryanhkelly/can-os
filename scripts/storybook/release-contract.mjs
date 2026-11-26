// Pure release contract. Callers own filesystem and process access.
export const requiredStages=["doctor","catalog","fonts","visual-config","contracts","route-registry","interactions","build","index","browser"];
export function isSafeStaticPath(path){
 if(typeof path!=="string"||!path||path.includes("\\")||path.startsWith("/")||path.split("/").some(p=>!p||p.startsWith(".")))return false;
 return !/(?:^|\/)(?:netlify\.toml|wrangler\.(?:toml|jsonc?)|credentials(?:\.[^/]*)?|secrets(?:\.[^/]*)?|_redirects|_headers)(?:\/|$)/i.test(path)&&!(/\.(?:pem|key|p12|pfx|sqlite|db|sql|ts|tsx|log|zip)$/i.test(path));
}
export function releaseErrors(receipt,head,manifestDigest,clean){
 const errors=[];
 if(!clean)errors.push("Working tree is not clean");
 if(!receipt||receipt.version!==1||receipt.commit!==head||!/^[0-9a-f]{40}$/.test(head))errors.push("Acceptance receipt is not for the exact checked-out commit");
 if(!receipt||receipt.status!=="passed")errors.push("Acceptance did not pass");
 if(!receipt||!Array.isArray(receipt.stages)||requiredStages.some((name,i)=>receipt.stages[i]?.name!==name||receipt.stages[i]?.status!=="passed")||receipt.stages.length!==requiredStages.length)errors.push("Required acceptance stage evidence is missing or failed");
 if(!receipt||receipt.staticDigest!==manifestDigest||!/^[0-9a-f]{64}$/.test(manifestDigest??""))errors.push("Static output differs from the tested catalog");
 return errors;
}
