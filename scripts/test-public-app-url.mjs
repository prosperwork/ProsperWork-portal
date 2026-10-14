import assert from"node:assert/strict";
import{publicAppUrl}from"../src/lib/supabase/app-url.mjs";
const prod={NODE_ENV:"production",APP_BASE_URL:"https://academy.example"};
assert.equal(publicAppUrl("/auth/finish?next=%2Freset-password",prod).href,"https://academy.example/auth/finish?next=%2Freset-password");
assert.equal(publicAppUrl("/login",{NODE_ENV:"development",REPLIT_DEV_DOMAIN:"preview.example"}).href,"https://preview.example/login");
for(const value of ["https://0.0.0.0:5000","http://localhost:3000","https://localhost","https://127.0.0.1","https://[::1]","https://user:pass@academy.example","https://academy.example/unexpected"]){
 assert.throws(()=>publicAppUrl("/login",{...prod,APP_BASE_URL:value}));
}
for(const path of ["//evil.example","/\\evil.example","https://evil.example","login"])assert.throws(()=>publicAppUrl(path,prod));
assert.throws(()=>publicAppUrl("/login",{NODE_ENV:"production",REPLIT_DEV_DOMAIN:"preview.example"}));
console.log("PASS Canonical public URLs, internal-address rejection, HTTPS requirement and open-redirect protection.");
