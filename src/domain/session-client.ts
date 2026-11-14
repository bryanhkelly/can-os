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
 try{window.sessionStorage.clear();}catch{}
 // Local storage persists across tabs. Preserve only the kiosk-mode preference.
 try{
  const mode=window.localStorage.getItem(sharedKey);
  for(const key of Object.keys(window.localStorage))
   if(key.startsWith("can-")&&key!==sharedKey)window.localStorage.removeItem(key);
  if(mode==="1")window.localStorage.setItem(sharedKey,"1");
 }catch{}
}
export function registerAccessClient():Promise<Response> {
 return fetch("/access/session",{method:"POST",credentials:"same-origin",cache:"no-store",
 headers:{"Content-Type":"application/json"},
 body:JSON.stringify({kind:"device",clientInstanceId:accessClientInstance(),sharedDevice:isSharedDeviceMode()})});
}
