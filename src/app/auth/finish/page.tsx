"use client";
import{useEffect,useState,useRef}from"react";
import{createBrowserClient}from"@supabase/ssr";
export default function FinishSignIn(){
 const[error,setError]=useState("");
 const started=useRef(false);
 useEffect(()=>{
  if(started.current)return;started.current=true;
  const fragment=new URLSearchParams(window.location.hash.slice(1));
  const access_token=fragment.get("access_token"),refresh_token=fragment.get("refresh_token");
  const next=new URLSearchParams(window.location.search).get("next");
   const destination=next==="/reset-password"?next:next==="/hiring"?next:next==="/welcome"?next:"/";
  // Never retain tokens in browser history or logs.
  window.history.replaceState(null,"",window.location.pathname+window.location.search);
  if(!access_token||!refresh_token){setError("This invitation or recovery link is missing or expired. Use Forgot password on the sign-in page to request a fresh link.");return;}
  const client=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  void client.auth.setSession({access_token,refresh_token}).then(async r=>{
   if(r.error||!(await client.auth.getUser()).data.user)throw Error("Invalid session");
   window.location.replace(destination);
  }).catch(()=>setError("This link could not establish a verified session. Request a fresh password-reset email from the sign-in page."));
 },[]);
 return <main style={{maxWidth:520,margin:"80px auto",padding:24,fontFamily:"sans-serif"}}><h1>ProsperWork secure sign-in</h1>{error?<><p role="alert">{error}</p><a href="/login">Return to sign in</a></>:<p role="status">Completing your invitation securely…</p>}</main>;
}
