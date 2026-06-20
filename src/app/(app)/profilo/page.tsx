import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, UserRound, Phone, Download, Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { ProfileSecurityActions } from "./security-actions";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type SearchParams = { complete?: string; next?: string; missing?: string };

function safeNextPath(value: unknown) {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function isProfileComplete(profile: Pick<ProfileRow, "first_name" | "last_name" | "phone"> | null | undefined) {
  const firstName = String(profile?.first_name ?? "").trim();
  const lastName = String(profile?.last_name ?? "").trim();
  const phone = String(profile?.phone ?? "").trim();
  return Boolean(firstName && lastName && phone);
}

export default async function ProfiloPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const completeMode = resolved?.complete === "1";
  const missing = resolved?.missing === "1";
  const nextPath = safeNextPath(resolved?.next);
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect("/login?next=%2Fprofilo");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profileRecord = (profile ?? null) as ProfileRow | null;
  const email = profileRecord?.email ?? user.email ?? "";
  const profileComplete = isProfileComplete(profileRecord);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Profilo</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Gestisci i dati personali e l’accesso. Tutte le modifiche sono salvate sul database.
        </p>
      </header>

      {completeMode || !profileComplete ? (
        <div className="rounded-3xl bg-slate-950/40 p-4 text-sm text-slate-200 ring-1 ring-inset ring-slate-800">
          <p className="font-semibold text-slate-50">Completa il profilo</p>
          <p className="mt-1 text-slate-300">
            Per usare la piattaforma serve inserire <span className="font-medium">nome</span>, <span className="font-medium">cognome</span> e{" "}
            <span className="font-medium">telefono</span>.
          </p>
          {missing ? <p className="mt-2 text-slate-200">Compila tutti i campi richiesti e salva.</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <UserRound className="h-4 w-4" />
              Dati profilo
            </div>
            <p className="text-lg font-semibold tracking-tight">Account</p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <p className="text-xs font-medium text-slate-400">Email</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-50">{email || "-"}</p>
            </div>

            <form action="/api/profile/update" method="post" className="grid gap-3">
              <input type="hidden" name="next" value={nextPath} />
              <input type="hidden" name="require_complete" value={completeMode || !profileComplete ? "1" : "0"} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <label htmlFor="first_name" className="text-sm font-medium text-slate-200">
                    Nome
                  </label>
                  <Input
                    id="first_name"
                    name="first_name"
                    defaultValue={profileRecord?.first_name ?? ""}
                    className="h-11 min-w-0"
                    required={completeMode || !profileComplete}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <label htmlFor="last_name" className="text-sm font-medium text-slate-200">
                    Cognome
                  </label>
                  <Input
                    id="last_name"
                    name="last_name"
                    defaultValue={profileRecord?.last_name ?? ""}
                    className="h-11 min-w-0"
                    required={completeMode || !profileComplete}
                  />
                </div>
              </div>
              <Button variant="primary" type="submit" className="w-full sm:w-auto">
                Salva dati
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <Phone className="h-4 w-4" />
              Telefono
            </div>
            <p className="text-lg font-semibold tracking-tight">Contatti</p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <form action="/api/profile/update" method="post" className="grid gap-3">
              <input type="hidden" name="next" value={nextPath} />
              <input type="hidden" name="require_complete" value={completeMode || !profileComplete ? "1" : "0"} />
              <div className="min-w-0 space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-slate-200">
                  Numero di telefono
                </label>
                <Input
                  id="phone"
                  name="phone"
                  inputMode="tel"
                  placeholder="+39..."
                  defaultValue={profileRecord?.phone ?? ""}
                  className="h-11 min-w-0"
                  required={completeMode || !profileComplete}
                />
              </div>
              <Button variant="primary" type="submit" className="w-full sm:w-auto">
                Salva telefono
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Shield className="h-4 w-4" />
            Sicurezza
          </div>
          <p className="text-lg font-semibold tracking-tight">Accesso e privacy</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href="/api/account/export"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900/70 px-4 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
            >
              <Download className="h-4 w-4" />
              Scarica i miei dati
            </a>
            <Link
              href="/wallet/movimenti"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900/70 px-4 text-sm font-medium text-slate-50 ring-1 ring-inset ring-slate-800 transition-colors hover:bg-slate-900 active:bg-slate-950"
            >
              <Shield className="h-4 w-4" />
              Storico movimenti
            </Link>
          </div>

          <ProfileSecurityActions />

          <div className="rounded-3xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
            <p className="text-sm font-semibold text-slate-50">Elimina account</p>
            <p className="mt-1 text-sm text-slate-300">
              Cancella definitivamente il tuo account e i dati collegati. Questa operazione non si può annullare.
            </p>
            <div className="mt-3">
              <ProfileSecurityActions mode="delete" />
              <div className="mt-2 text-xs text-slate-500">
                <Trash2 className="inline h-4 w-4" /> Ti verrà chiesta conferma prima di procedere.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
