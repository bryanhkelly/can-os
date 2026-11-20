/** Tab-scoped, non-secret browser identifier. Never use for authentication. */
const idKey="can-access-client-instance";
const sharedKey="can-shared-device-mode";
const revocationKey="can-session-revocation";
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
 try{
  if(enabled){
   // Remove previously durable video bookmarks when enabling kiosk mode;
   // future progress remains in tab-scoped sessionStorage.
   const storage=window.localStorage;
   for(let index=storage.length-1;index>=0;index--){
    const key=storage.key(index);
    if(key?.startsWith("can-native-video-progress:"))storage.removeItem(key);
   }
   storage.setItem(sharedKey,"1");
  }else window.localStorage.removeItem(sharedKey);
 }catch{}
}
/** Clear only CAN-owned state. Other same-origin features may use this tab's
 * storage, and a sign-out must not erase their unrelated data. Iterate
 * backwards so removals cannot skip keys in the Storage index. */
function clearCanStorageKeys(storage:Storage,preserve:ReadonlySet<string>=new Set()):void {
 for(let index=storage.length-1;index>=0;index--){
  const key=storage.key(index);
  if(key?.startsWith("can-")&&!preserve.has(key))storage.removeItem(key);
 }
}
/** Broadcast a local account handoff to every tab. Events carry no account ID or secret. */
export function clearLearnerBrowserState(broadcast=true):void {
 try{clearCanStorageKeys(window.sessionStorage);}catch{}
 // Preserve kiosk preference and the latest cross-tab revocation marker only.
 try{
  const storage=window.localStorage;
  clearCanStorageKeys(storage,new Set([sharedKey,revocationKey]));
  if(broadcast)storage.setItem(revocationKey,
   String(Date.now())+":"+crypto.randomUUID());
 }catch{}
}
/** Called only by already authenticated UI shells, never on a sign-in form. */
export function observeSessionHandoffs(callback:()=>void):()=>void {
 const listener=(event:StorageEvent)=>{
  if(event.key!==revocationKey||!event.newValue)return;
  clearLearnerBrowserState(false);
  callback();
 };
 window.addEventListener("storage",listener);
 return ()=>window.removeEventListener("storage",listener);
}
export function registerAccessClient():Promise<Response> {
 return fetch("/access/session",{method:"POST",credentials:"same-origin",cache:"no-store",
 headers:{"Content-Type":"application/json"},
 body:JSON.stringify({kind:"device",clientInstanceId:accessClientInstance(),sharedDevice:isSharedDeviceMode()})});
}
