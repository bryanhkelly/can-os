/** Low-entropy device classification; NOT device identity or access authority. */
export type SessionDeviceContext={
 deviceCategory:string;browserFamily:string;osFamily:string;
 ipAddress:string|null;networkObservedAt:Date|null;
};
/** The edge MUST overwrite the configured header. Never trust X-Forwarded-For. */
export function classifySessionDevice(request:Request, trustedHeader=process.env.CAN_TRUSTED_CLIENT_IP_HEADER):SessionDeviceContext {
 const ua=(request.headers.get("user-agent")??"").slice(0,512);
 const deviceCategory=/ipad|tablet|silk/i.test(ua)?"tablet":/iphone|android.*mobile|mobile/i.test(ua)?"phone":"desktop";
 const browserFamily=/edg\//i.test(ua)?"Edge":/firefox\//i.test(ua)?"Firefox":/chrome\//i.test(ua)?"Chrome":/safari\//i.test(ua)?"Safari":"Unknown";
 const osFamily=/windows/i.test(ua)?"Windows":/android/i.test(ua)?"Android":/iphone|ipad|ios/i.test(ua)?"iOS":/mac os|macintosh/i.test(ua)?"macOS":/cros/i.test(ua)?"ChromeOS":/linux/i.test(ua)?"Linux":"Unknown";
 const name=trustedHeader?.toLowerCase();
 const raw=name&&["x-nf-client-connection-ip","cf-connecting-ip"].includes(name)?request.headers.get(name)?.trim():null;
 const ipAddress=raw&&raw.length<=45&&/^[0-9a-fA-F:.]+$/.test(raw)&&(raw.includes(":")||/^\d{1,3}(\.\d{1,3}){3}$/.test(raw))?raw:null;
 return {deviceCategory,browserFamily,osFamily,ipAddress,networkObservedAt:ipAddress?new Date():null};
}
export function learningEvidenceLevel(kind:string) {
 return kind==="self_reported"?"self_reported" as const:"client_observed" as const;
}
