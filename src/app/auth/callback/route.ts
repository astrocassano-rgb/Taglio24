import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("Errore durante exchangeCodeForSession:", error.message);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
        );
      }
    } catch (err: any) {
      console.error("Errore imprevisto nel callback auth:", err?.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(err?.message ?? "Errore di autenticazione")}`, request.url)
      );
    }
  }

  // URL di reindirizzamento sicuro
  return NextResponse.redirect(new URL(next, request.url));
}
