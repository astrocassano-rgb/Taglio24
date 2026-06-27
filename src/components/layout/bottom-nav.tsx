"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { Home, CalendarDays, Wallet, Scissors, User, LogIn } from "lucide-react";
import { cn } from "@/lib/cn";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";

export function BottomNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const [isLogged, setIsLogged] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsLogged(false);
      return;
    }
    let mounted = true;
    const checkSession = async () => {
      const { data } = await safeGetSession(supabase);
      if (mounted) setIsLogged(Boolean(data.session));
    };
    void checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setIsLogged(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const items = useMemo(() => {
    if (isLogged) {
      return [
        { href: "/" as Route, label: "Home", Icon: Home },
        { href: "/prenota" as Route, label: "Prenota", Icon: CalendarDays },
        { href: "/wallet" as Route, label: "Wallet", Icon: Wallet },
        { href: "/profili" as Route, label: "Miei Profili", Icon: Scissors },
        { href: "/profilo" as Route, label: "Profilo", Icon: User }
      ];
    } else {
      return [
        { href: "/" as Route, label: "Home", Icon: Home },
        { href: "/prenota" as Route, label: "Disponibilità", Icon: CalendarDays },
        { href: "/login" as Route, label: "Accedi", Icon: LogIn }
      ];
    }
  }, [isLogged]);

  // Se lo stato dell'autenticazione è ancora in caricamento, evitiamo flash del layout
  if (isLogged === null) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className={cn(
        "mx-auto grid px-2 pb-[calc(env(safe-area-inset-bottom))] pt-2 transition-all duration-300",
        pathname === "/prenota" ? "max-w-4xl" : "max-w-md",
        items.length === 5 ? "grid-cols-5" :
        items.length === 4 ? "grid-cols-4" :
        items.length === 3 ? "grid-cols-3" : "grid-cols-2"
      )}>
        {items.map(({ href, label, Icon }) => {
          const isActive = pathname === href || (href === "/login" && pathname?.startsWith("/login"));
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] leading-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
                isActive ? "text-blue-300" : "text-slate-300 hover:text-slate-50"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5", isActive ? "text-blue-300" : "text-slate-300")} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
