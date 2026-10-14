import{NextRequest,NextResponse}from"next/server";
import{identity}from"@/lib/supabase/identity";
import{provisioningClient}from"@/lib/supabase/server";
export async function GET(request:NextRequest){
 const{client,profile}=await identity();
 if(!profile||!["active","on_leave"].includes(profile.status))return NextResponse.json({error:"Sign in required."},{status:401});
 const id=request.nextUrl.searchParams.get("id");if(!id||!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"Choose a media record."},{status:400});
 const item=await client.from("pw_media_reviews").select("file_id,status,student_id").eq("id",id).single();
 if(item.error||!item.data||item.data.status==="withdrawn")return NextResponse.json({error:"This private media is not available."},{status:403});
 // An authenticated, native-RLS authorized queue row is the prerequisite for privileged signing.
 if(profile.role==="social_media"&&!["approved","published"].includes(item.data.status))return NextResponse.json({error:"Independent approval required."},{status:403});
 const admin=provisioningClient();
 const file=await admin.from("pw_files").select("path,original_name").eq("id",item.data.file_id).eq("complete",true).single();
 if(file.error)return NextResponse.json({error:"The actual file is unavailable."},{status:404});
 const isDownload=request.nextUrl.searchParams.get("download")==="true";
 const signed=await admin.storage.from("pw-private").createSignedUrl(file.data.path,120,isDownload?{download:file.data.original_name||"student-media"}:undefined);
 if(signed.error)return NextResponse.json({error:"Storage is unavailable."},{status:503});
 return NextResponse.redirect(signed.data.signedUrl,{status:307,headers:{"Cache-Control":"private, no-store"}});
}
