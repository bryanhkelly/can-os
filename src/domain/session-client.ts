/** Tab-scoped, non-secret browser identifier. Never use for authentication. */
const idKey="can-access-client-instance";
const sharedKey="can-shared-device-mode";
export function accessClientInstance():string {
 try {const prior=window.sessionStorage.getItem(idKey);
 if(prior&&/^[0-9a-f-]{36}$/i.test(prior))return prior;
 const created=crypto.randomUUID();window.sessionStorage.setItem(idKey,created);return created;
 }catch{return crypto.randomUUID();}
}
export function isSharedDeviceMode():boolean {
 try{return window.localStorage.getItem(sharedKey)==="1";}catch{return false;}
}
export function setSharedDeviceMode(enabled:boolean):void {
 try{if(enabled)window.localStorage.setItem(sharedKey,"1");else window.localStorage.removeItem(sharedKey);}catch{}
}
export function clearLearnerBrowserState():void {
 try{for(const key of Object.keys(window.sessionStorage))
 if(key==="can-access-client-instance"||key.startsWith("can-learning-"))window.sessionStorage.removeItem(key);}catch{}
}
export function registerAccessClient():Promise<Response> {
 return fetch("/access/session",{method:"POST",credentials:"same-origin",cache:"no-store",
 headers:{"Content-Type":"application/json"},
 body:JSON.stringify({kind:"device",clientInstanceId:accessClientInstance(),sharedDevice:isSharedDeviceMode()})});
}
