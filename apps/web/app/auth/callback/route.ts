import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "@/lib/db/supabaseEnv";

const resolveRedirectPath = (url: URL) => {
  const nextParam = url.searchParams.get("next");
  if (nextParam && nextParam.startsWith("/")) {
    return nextParam;
  }
  return "/";
};

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${callbackUrl.origin}/login?error=missing_code`);
  }

  const supabaseUrl = resolveSupabaseUrl() ?? "";
  const supabaseAnonKey = resolveSupabaseAnonKey() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${callbackUrl.origin}/login?error=missing_supabase_config`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${callbackUrl.origin}/login?error=oauth`);
  }

  const email = data.session.user?.email;

  if (!isEmailAllowed(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${callbackUrl.origin}/login?error=unauthorized`);
  }

  const redirectPath = resolveRedirectPath(callbackUrl);
  return NextResponse.redirect(`${callbackUrl.origin}${redirectPath}`);
}
