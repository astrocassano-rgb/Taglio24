import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ChevronRight, Dog, FileText, Image as ImageIcon, Calendar } from "lucide-react";
import type { Database } from "@/types/database";

type DogRow = Database["public"]["Tables"]["dogs"]["Row"];
type Treatment = Database["public"]["Tables"]["pet_treatments"]["Row"];
type Gallery = Database["public"]["Tables"]["pet_gallery"]["Row"];

export const dynamic = "force-dynamic";

function fmtDate(value: string) {
  const d = new Date(value);
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export default async function AdminDogDettaglioPage({ params }: { params: Promise<{ dogId: string }> }) {
  const { dogId } = await params;
  const { supabase } = await requireAdmin({ next: `/admin/cani/${dogId}`, mode: "notFound" });

  const [{ data: dog }, { data: treatments }, { data: gallery }] = await Promise.all([
    supabase.from("dogs").select("*, profiles(first_name, last_name)").eq("id", dogId).maybeSingle(),
    supabase.from("pet_treatments").select("*").eq("dog_id", dogId).order("treatment_date", { ascending: false }),
    supabase.from("pet_gallery").select("*").eq("dog_id", dogId).order("created_at", { ascending: false }),
  ]);

  if (!dog) notFound();

  const dogRow = dog as any;
  const treatmentsRows = (treatments ?? []) as Treatment[];
  const galleryRows = (gallery ?? []) as Gallery[];

  const ownerName = [dogRow.profiles?.first_name, dogRow.profiles?.last_name].filter(Boolean).join(" ").trim() || "Cliente Sconosciuto";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <header className="space-y-2">
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/admin/clienti" className="hover:text-slate-300 transition-colors">Clienti</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/admin/clienti/${dogRow.owner_id}`} className="hover:text-slate-300 transition-colors">{ownerName}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300 font-medium">{dogRow.name}</span>
        </nav>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-2xl shadow-lg ring-1 ring-inset ring-amber-500/20">
            🐶
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{dogRow.name}</h2>
            <p className="text-sm text-slate-400">
              {[dogRow.breed, dogRow.size, dogRow.weight ? `${dogRow.weight} kg` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      {/* Info Base */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium text-amber-400">Anagrafica</p>
          <p className="text-lg font-semibold tracking-tight">Dati del cane</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/50 p-3 ring-1 ring-inset ring-slate-800">
              <Dog className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Razza / Taglia</p>
                <p className="text-sm text-slate-100">{dogRow.breed || "Sconosciuta"} ({dogRow.size})</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-900/50 p-3 ring-1 ring-inset ring-slate-800">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Note</p>
                <p className="text-sm text-slate-100">{dogRow.notes || "Nessuna nota."}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {/* Storico Trattamenti */}
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-amber-400">Storico</p>
            <p className="text-lg font-semibold tracking-tight">Trattamenti ({treatmentsRows.length})</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {treatmentsRows.length ? (
              treatmentsRows.map((t) => (
                <div key={t.id} className="rounded-2xl bg-slate-900/40 p-4 ring-1 ring-inset ring-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-50">{t.treatment_type}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {fmtDate(t.treatment_date)}
                    </span>
                  </div>
                  {t.products_used && (
                    <p className="text-xs text-slate-400">Prodotti: <span className="text-slate-300">{t.products_used}</span></p>
                  )}
                  {t.groomer_notes && (
                    <p className="text-xs text-slate-400">Note operatore: <span className="text-slate-300">{t.groomer_notes}</span></p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400">Nessun trattamento registrato.</div>
            )}
          </CardContent>
        </Card>

        {/* Galleria Foto */}
        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-amber-400">Media</p>
            <p className="text-lg font-semibold tracking-tight">Galleria Foto ({galleryRows.length})</p>
          </CardHeader>
          <CardContent>
            {galleryRows.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {galleryRows.map((g) => (
                  <div key={g.id} className="group relative aspect-square rounded-xl bg-slate-800 overflow-hidden ring-1 ring-inset ring-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.photo_url} alt={g.caption || "Foto"} className="object-cover w-full h-full transition-transform group-hover:scale-105" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl bg-slate-900/30 p-3 text-sm text-slate-400">
                <ImageIcon className="h-4 w-4" /> Nessuna foto in galleria.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
