  import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import{publicAppUrl}from"./lib/supabase/app-url.mjs";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    },
  });
  const { data: { user } } = await client.auth.getUser();
  if (["/", "/schedule", "/students", "/leads", "/finance", "/people", "/curriculum", "/reports", "/homework", "/workflows", "/accounts", "/settings", "/classroom", "/payroll","/learning","/documents","/family","/policies","/onboarding","/kid","/studio","/leave","/hiring","/operations","/profile"].includes(request.nextUrl.pathname)) {
    let destination: string | null = null;
    if (!user) {
      destination = request.nextUrl.pathname !== "/"
        ? `/login?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
        : "/login";
    }
    else {
      const { data } = await client.from("pw_profiles").select("status,role").eq("id", user.id).single();
      if (!data || (!["active", "on_leave"].includes(data.status)&&!(request.nextUrl.pathname==="/hiring"&&data.status==="applicant"&&!["parent","student"].includes(data.role)))) destination = "/access-pending";
      else if(["parent","student"].includes(data.role)&&request.nextUrl.pathname!=="/onboarding"&&!(request.nextUrl.pathname==="/kid"&&data.role==="student"&&request.cookies.has("pw-kid-parent"))){
        const policy=await client.rpc("pw_policy_ready");
        if(policy.error||!policy.data)destination="/onboarding";
      }
    }
    if (destination) {
      let targetUrl: URL;
      try {
        targetUrl = publicAppUrl(destination);
      } catch {
        targetUrl = new URL(destination, request.nextUrl.origin);
      }
      const redirect = NextResponse.redirect(targetUrl);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/", "/schedule", "/students", "/leads", "/finance", "/people", "/curriculum", "/reports", "/homework", "/workflows", "/accounts", "/settings", "/classroom", "/payroll","/learning","/documents","/family","/policies","/onboarding","/kid","/studio","/leave","/hiring","/operations","/management","/communications","/manual","/profile", "/login", "/access-pending", "/reset-password", "/api/:path*"] };
