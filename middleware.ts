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
  const pathname = request.nextUrl.pathname;

  // --- CONTROLLO SCADENZA E ISOLAMENTO TENANT (SUBDOMAIN CHECKS) ---
  const host = request.headers.get("host") || "";
  const domainParts = host.split(".");
  let subdomain = "";

  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    const parts = host.split(":");
    const part0 = parts[0];
    if (part0) {
      const localParts = part0.split(".");
      if (localParts.length > 1) {
        subdomain = localParts[0] || "";
      }
    }
  } else {
    if (domainParts.length >= 3) {
      const sub = domainParts[0] || "";
      if (sub !== "www" && sub !== "app") {
        subdomain = sub;
      }
    }
  }

  if (subdomain && subdomain !== "default") {
    // Escludiamo API, static files, auth callback, e le pagine di errore stesse
    const isPageRequest = !pathname.startsWith("/api") &&
                          !pathname.startsWith("/_next") &&
                          !pathname.startsWith("/auth") &&
                          pathname !== "/salone-errato" &&
                          pathname !== "/abbonamento-scaduto" &&
                          !pathname.includes(".");

    if (isPageRequest) {
      try {
        const { data: tenant } = await (supabase.from("tenants") as any)
          .select("id, name, slug, subscription_ends_at")
          .eq("slug", subdomain)
          .maybeSingle();

        if (tenant) {
          // Impostiamo il cookie del tenant corrente sulla response per il client
          response.cookies.set("current_tenant_id", tenant.id, {
            path: "/",
            domain: host.includes("localhost") || host.includes("127.0.0.1") ? undefined : `.${process.env.TENANT_ROOT_DOMAIN || "app.dogwash24.it"}`,
            httpOnly: false,
            maxAge: 60 * 60 * 24 * 365,
          });

          // 1. Verifica Scadenza
          const isExpired = tenant.subscription_ends_at
            ? new Date(tenant.subscription_ends_at) < new Date()
            : false;

          if (isExpired) {
            const expiredUrl = request.nextUrl.clone();
            expiredUrl.pathname = "/abbonamento-scaduto";
            expiredUrl.search = "";
            return NextResponse.redirect(expiredUrl);
          }
        }
      } catch (err) {
        console.error("[Middleware] Errore verifica tenant/scadenza:", err);
      }
    }
  }

  // Se l'utente non è loggato ma prova ad andare su /salone-errato, lo mandiamo al login
  if (pathname === "/salone-errato" && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // Account condiviso multisalone: nessun salone è "sbagliato" per un cliente loggato.
  // (Il vecchio controllo leggeva profiles.tenant_id, colonna rimossa dalla migrazione multisalone.)
  if (pathname === "/salone-errato" && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

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
    if (role === "superadmin") {
      // Il superadmin ha accesso a tutte le rotte admin
    } else {
      // Verifica l'appartenenza come admin per questo specifico salone
      const { data: tenant } = await (supabase.from("tenants") as any)
        .select("id")
        .eq("slug", subdomain)
        .maybeSingle();

      if (tenant) {
        const { data: membership } = await (supabase.from("tenant_customers") as any)
          .select("role")
          .eq("customer_id", user.id)
          .eq("tenant_id", tenant.id)
          .maybeSingle();

        if (membership?.role !== "admin") {
          const targetUrl = request.nextUrl.clone();
          targetUrl.pathname = "/";
          targetUrl.search = "";
          return NextResponse.redirect(targetUrl);
        }
      } else {
        const targetUrl = request.nextUrl.clone();
        targetUrl.pathname = "/";
        targetUrl.search = "";
        return NextResponse.redirect(targetUrl);
      }
    }
  }

  // Se l'utente è loggato e prova ad andare su /login, lo rimandiamo alla destinazione desiderata o a quella basata sul ruolo
  if (request.nextUrl.pathname === '/login' && user) {
    const nextPath = request.nextUrl.searchParams.get('next');
    const targetUrl = request.nextUrl.clone();
    const role = (user as any)?.app_metadata?.role;

    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
      const nextUrl = new URL(nextPath, request.url);
      targetUrl.pathname = nextUrl.pathname;
      targetUrl.search = nextUrl.search;
    } else {
      if (role === "superadmin") {
        targetUrl.pathname = '/superadmin';
      } else if (role === "admin") {
        targetUrl.pathname = '/admin';
      } else {
        targetUrl.pathname = '/';
      }
      targetUrl.search = '';
    }

    return NextResponse.redirect(targetUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"]
};
