"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scissors, Plus, Trash2, Sparkles } from "lucide-react";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import type { Database } from "@/types/database";

type ClientProfile = Database["public"]["Tables"]["dogs"]["Row"];

const HAIR_LENGTHS: Record<string, string> = {
  SMALL: "Capelli Corti / Rasati",
  MEDIUM: "Capelli Medi",
  LARGE: "Capelli Lunghi",
  GIANT: "Capelli Molto Lunghi"
};

export default function ProfiliPage() {
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = tryCreateSupabaseBrowserClient();

  useEffect(() => {
    async function loadProfiles() {
      if (!supabase) return;
      setLoading(true);
      const { data } = await supabase.from("dogs").select("*").order("created_at", { ascending: false });
      if (data) setProfiles(data);
      setLoading(false);
    }
    void loadProfiles();
  }, [supabase]);

  const removeProfile = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("dogs").delete().eq("id", id);
    if (!error) {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Profili di Taglio</h2>
        <p className="text-sm leading-relaxed text-slate-200">
          Aggiungi e gestisci i profili di taglio per te o per i tuoi familiari per prenotazioni veloci.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Lista</p>
            <p className="text-lg font-semibold tracking-tight">
              {profiles.length ? `${profiles.length} ${profiles.length === 1 ? "profilo" : "profili"}` : "Nessun profilo ancora"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800">
            <Scissors className="h-5 w-5 text-blue-300" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {profiles.length ? (
            <div className="grid gap-3">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{profile.name}</p>
                      <p className="mt-1 text-xs text-slate-300">
                        {profile.breed ? `Capelli: ${profile.breed}` : "Tipo capelli non indicato"} · {HAIR_LENGTHS[profile.size] || profile.size}
                      </p>
                      {profile.notes ? (
                        <p className="mt-2 text-xs text-slate-300/80 bg-slate-950/20 p-2 rounded-lg border border-slate-900">
                          <span className="font-semibold block text-[10px] text-blue-300 uppercase tracking-wider mb-0.5">Note Barbiere:</span>
                          {profile.notes}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="md"
                      className="h-10 w-10 px-0"
                      onClick={() => removeProfile(profile.id)}
                      aria-label="Rimuovi profilo"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800">
              <p className="text-sm font-semibold">Crea il tuo primo profilo</p>
              <p className="mt-1 text-xs text-slate-300">Ci vogliono meno di 60 secondi.</p>
            </div>
          )}

          <Link href="/profili/nuovo">
            <Button className="w-full" variant="primary">
              <Plus className="h-5 w-5" />
              Aggiungi Profilo
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
