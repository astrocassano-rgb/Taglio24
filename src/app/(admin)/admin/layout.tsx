import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LogoutButton } from "@/components/layout/logout-button";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/admin/prenotazioni", label: "Prenotazioni" },
  { href: "/admin/sessioni", label: "Sessioni" },
  { href: "/admin/kiosk", label: "Kiosk" },
  { href: "/admin/clienti", label: "Clienti" },
  { href: "/admin/pagamenti", label: "Pagamenti" },
  { href: "/admin/postazioni", label: "Postazioni" },
  { href: "/admin/coupons", label: "Coupons" }
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin({ next: "/admin", mode: "notFound" });

  return (
    <div className="min-h-dvh bg-slate-950">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="space-y-1 pb-4">
            <p className="text-xs font-medium text-slate-300">Area Admin</p>
            <p className="text-lg font-semibold tracking-tight text-slate-50">DogWash24</p>
          </div>
          <nav className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="rounded-2xl bg-slate-950/40 px-4 py-3 text-sm font-medium text-slate-100 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-950/60"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pt-4">
            <Link
              href="/"
              className="block rounded-2xl bg-slate-950/40 px-4 py-3 text-sm font-medium text-slate-200 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-950/60"
            >
              Torna alla app
            </Link>
          </div>
          <div className="pt-3">
            <LogoutButton />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
