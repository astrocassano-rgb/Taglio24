import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./src/types/database";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
          cookiesToSet.forEach((cookie) => response.cookies.set(cookie.name, cookie.value, cookie.options));
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/prenota/nuova") ||
    request.nextUrl.pathname.startsWith("/cani") ||
    request.nextUrl.pathname.startsWith("/wallet") ||
    request.nextUrl.pathname.startsWith("/profilo") ||
    request.nextUrl.pathname.startsWith("/prenotazioni");

  if ((isProtectedRoute || isAdminRoute) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && user) {
    const role = (user as any)?.app_metadata?.role;
    if (role !== "admin") {
      const targetUrl = request.nextUrl.clone();
      targetUrl.pathname = "/";
      targetUrl.search = "";
      return NextResponse.redirect(targetUrl);
    }
  }

  // Se l'utente è loggato e prova ad andare su /login, lo rimandiamo alla destinazione desiderata oppure alla home
  if (request.nextUrl.pathname === '/login' && user) {
    const nextPath = request.nextUrl.searchParams.get('next');
    const targetUrl = request.nextUrl.clone();

    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
      const nextUrl = new URL(nextPath, request.url);
      targetUrl.pathname = nextUrl.pathname;
      targetUrl.search = nextUrl.search;
    } else {
      targetUrl.pathname = '/';
      targetUrl.search = '';
    }

    return NextResponse.redirect(targetUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"]
};
