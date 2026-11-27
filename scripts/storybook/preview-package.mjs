import {lstatSync,readFileSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {staticManifest} from "./static-manifest.mjs";

// The same metadata is checked at preparation and immediately before deploy.
// robots.txt is not access control; keep the Worker private.
export function previewMetadata(cloudflare){
 const files={
  "_headers":`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow, noarchive
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; frame-src 'self' blob:; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:
`,
  "robots.txt":"User-agent: *\nDisallow: /\n"
 };
 if(cloudflare)files._redirects="/ /index.html 200\n";
 return files;
}
export function writePreviewMetadata(root,cloudflare){
 for(const [name,value] of Object.entries(previewMetadata(cloudflare)))
  writeFileSync(join(root,name),value,{flag:"wx"});
}
export function verifyPreviewPackage(root,accepted,cloudflare){
 const metadata=previewMetadata(cloudflare);
 for(const [name,value] of Object.entries(metadata)){
  const path=join(root,name);
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||!readFileSync(path).equals(Buffer.from(value)))
   throw Error("Unexpected preview metadata: "+name);
 }
 // Ignore only the verified root metadata in the content manifest. Any
 // extra file, nested metadata, symlink or modified asset is rejected.
 const actual=staticManifest(root,{ignoredRootFiles:Object.keys(metadata)});
 const expected=accepted.files.filter(file=>!file.path.endsWith(".map"));
 if(!isDeepStrictEqual(actual.files,expected))throw Error("Preview assets differ from accepted catalog.");
 return actual;
}
