// Server-only public URLs must come from trusted configuration, not Next's
// internal bind address or arbitrary Host/X-Forwarded-Host headers.
export function publicAppUrl(path = "/", env = process.env){
 const configured=env.APP_BASE_URL||(env.NODE_ENV!=="production"&&env.REPLIT_DEV_DOMAIN?`https://${env.REPLIT_DEV_DOMAIN}`:null);
 if(!configured)throw Error("PUBLIC_APP_URL_NOT_CONFIGURED");
 const base=new URL(configured);
 if(base.protocol!=="https:"||base.username||base.password||base.port||base.pathname!=="/"||base.search||base.hash
  ||["localhost","0.0.0.0","127.0.0.1","[::]","[::1]"].includes(base.hostname)||base.hostname.endsWith(".localhost")){
  throw Error("PUBLIC_APP_URL_INVALID");
 }
 if(typeof path!=="string"||!path.startsWith("/")||path.startsWith("//"))throw Error("PUBLIC_APP_PATH_INVALID");
 const target=new URL(path,base.origin);if(target.origin!==base.origin)throw Error("PUBLIC_APP_PATH_INVALID");
 return target;
}
