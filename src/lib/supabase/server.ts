import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getEnv } from "@/lib/env";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
};

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getEnv();
  if (!env) throw new Error("Variabili d'ambiente Supabase mancanti (.env.local).");

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server Components this can throw; session refresh is handled in middleware when needed.
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Multi‑tenant Supabase client helper
// ---------------------------------------------------------------------------
/**
 * Returns a Supabase client scoped to a specific tenant.
 * It reads tenant‑specific environment variables that follow the pattern:
 *   NEXT_PUBLIC_SUPABASE_URL_<TENANT>
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY_<TENANT>
 * If the variables are not defined for the given tenant, it falls back to the
 * default project variables.
 */
export async function getSupabaseForTenant(tenantId: string) {
  const cookieStore = await cookies();
  const env = getEnv();
  if (!env) throw new Error("Variabili d'ambiente Supabase mancanti (.env.local).");

  const suffix = tenantId.toUpperCase();
  const url = (env as any)[`NEXT_PUBLIC_SUPABASE_URL_${suffix}`] || env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = (env as any)[`NEXT_PUBLIC_SUPABASE_ANON_KEY_${suffix}`] || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Silent failure in Server Components – session refresh handled elsewhere.
        }
      }
    }
  });
}
