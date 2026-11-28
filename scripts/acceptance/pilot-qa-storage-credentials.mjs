// Local operator-only credential derivation. Never pass the parent secret to QA.
import {createHash,createHmac} from "node:crypto";
export const QA_BRANCH="br-solitary-art-arun91gj";
export const QA_PREFIX="qa/"+QA_BRANCH+"/";
const actions=["GetObject","HeadObject","PutObject"];
const encode=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
const digest=value=>createHash("sha256").update(value).digest("hex");
const validBucket=value=>typeof value==="string"&&/^[a-z0-9][a-z0-9.-]{2,62}$/.test(value);
export function mintQaStorage(parent,now=Math.floor(Date.now()/1000)){
  const {CAN_R2_ACCOUNT_ID:account,CAN_R2_BUCKET:bucket,CAN_R2_ACCESS_KEY_ID:access,CAN_R2_SECRET_ACCESS_KEY:secret}=parent;
  if(!/^[a-f0-9]{32}$/.test(account??"")||!validBucket(bucket)||!access||!secret||parent.CAN_R2_SESSION_TOKEN)
    throw Error("Existing private R2 parent credentials required");
  const payload={bucket,actions,paths:{prefixPaths:[QA_PREFIX],objectPaths:[]},
    sub:account,iss:access,aud:account+".r2.cloudflarestorage.com",iat:now,exp:now+4*3600};
  const unsigned=encode({alg:"HS256",typ:"JWT"})+"."+encode(payload);
  const jwt=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
  return {CAN_R2_ACCOUNT_ID:account,CAN_R2_BUCKET:bucket,CAN_R2_ACCESS_KEY_ID:access,
    CAN_R2_SECRET_ACCESS_KEY:digest(jwt),CAN_R2_SESSION_TOKEN:Buffer.from("jwt/"+jwt).toString("base64")};
}
// Inspect claims and derived secret to reject accidentally copied broad credentials.
// R2 itself authenticates the JWT signature and enforces its paths and actions.
export function assertQaStorageScope(config,now=Math.floor(Date.now()/1000)){
  const {CAN_R2_ACCOUNT_ID:account,CAN_R2_BUCKET:bucket,CAN_R2_ACCESS_KEY_ID:access,
    CAN_R2_SECRET_ACCESS_KEY:secret,CAN_R2_SESSION_TOKEN:token}=config;
  if(!token||!access||!secret||!validBucket(bucket)||!/^([a-f0-9]{32})$/.test(account??""))
    throw Error("Missing scoped storage session");
  const raw=Buffer.from(token,"base64").toString("utf8");
  if(!raw.startsWith("jwt/"))throw Error("Locally scoped R2 session required");
  const jwt=raw.slice(4),parts=jwt.split(".");
  if(parts.length!==3||digest(jwt)!==secret)throw Error("Invalid temporary R2 credential");
  const header=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
  const c=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
  if(header.alg!=="HS256"||c.bucket!==bucket||c.iss!==access||c.sub!==account||
    c.aud!==account+".r2.cloudflarestorage.com"||!Number.isInteger(c.iat)||!Number.isInteger(c.exp)||
    c.iat>now+60||c.exp-now<900||c.exp-c.iat>4*3600||
    c.scope!==undefined||JSON.stringify(c.actions)!==JSON.stringify(actions)||
    JSON.stringify(c.paths?.prefixPaths)!==JSON.stringify([QA_PREFIX])||
    JSON.stringify(c.paths?.objectPaths)!=="[]")throw Error("Expired or incorrectly scoped QA R2 session");
}
