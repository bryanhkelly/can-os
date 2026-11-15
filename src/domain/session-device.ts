/** Low-entropy device classification; NOT device identity or access authority. */
export type SessionDeviceContext={
 deviceCategory:string;browserFamily:string;osFamily:string;
 ipAddress:string|null;networkObservedAt:Date|null;
};
/** An address is accepted only from a verified server-side source, NEVER Request headers. */
export function classifySessionDevice(request:Request, verifiedIp:string|null=null):SessionDeviceContext {
 const ua=(request.headers.get("user-agent")??"").slice(0,512);
 const deviceCategory=/ipad|tablet|silk/i.test(ua)?"tablet":/iphone|android.*mobile|mobile/i.test(ua)?"phone":"desktop";
 const browserFamily=/edg\//i.test(ua)?"Edge":/firefox\//i.test(ua)?"Firefox":/chrome\//i.test(ua)?"Chrome":/safari\//i.test(ua)?"Safari":"Unknown";
 const osFamily=/windows/i.test(ua)?"Windows":/android/i.test(ua)?"Android":/iphone|ipad|ios/i.test(ua)?"iOS":/mac os|macintosh/i.test(ua)?"macOS":/cros/i.test(ua)?"ChromeOS":/linux/i.test(ua)?"Linux":"Unknown";
 const ipAddress=verifiedIp&&verifiedIp.length<=45&&/^[0-9a-fA-F:.]+$/.test(verifiedIp)?verifiedIp:null;
 return {deviceCategory,browserFamily,osFamily,ipAddress,networkObservedAt:ipAddress?new Date():null};
}
export function learningEvidenceLevel(kind:string) {
 return kind==="self_reported"?"self_reported" as const:"client_observed" as const;
}
