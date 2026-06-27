"use client";

import * as React from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { LogoutButton } from "@/components/layout/logout-button";
import { DevSwCleanup } from "@/components/dev/dev-sw-cleanup";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWide = pathname === "/prenota";

  return (
    <div className="min-h-dvh">
      <DevSwCleanup />
      <div className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
        <div className={cn(
          "mx-auto flex items-center justify-between px-4 py-4 transition-all duration-300",
          isWide ? "max-w-4xl" : "max-w-md"
        )}>
          <div>
            <p className="text-sm text-slate-300">Taglio24</p>
            <h1 className="text-base font-semibold tracking-tight">Smart Booking</h1>
          </div>
          <LogoutButton />
        </div>
      </div>

      <main className={cn(
        "mx-auto px-4 pb-24 pt-6 transition-all duration-300",
        isWide ? "max-w-4xl w-full" : "max-w-md"
      )}>{children}</main>

      <BottomNav />
    </div>
  );
}

