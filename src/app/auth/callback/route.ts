import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Accetta solo path relativi — previene open redirect verso domini esterni */
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  // Blocca anche protocolli mascherati tipo /\evil.com
  try {
    const url = new URL(value, "http://localhost");
    if (url.hostname !== "localhost") return "/";
  } catch {
    return "/";
  }
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

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

  // URL di reindirizzamento sicuro (validato da safeNextPath)
  return NextResponse.redirect(new URL(next, request.url));
}
