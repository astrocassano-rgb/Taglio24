import { requireAdmin } from "@/lib/auth/require-admin";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Settings, Users } from "lucide-react";
import { updateSystemSettings } from "./actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  const { supabase } = await requireAdmin();

  const { data: settings } = await supabase.from("system_settings").select("*").eq("id", 1).single();

  const mode = settings?.mode || "HYBRID";
  const maxAssisted = settings?.max_concurrent_assisted || 1;
  const enableAssisted = settings?.enable_assisted_wash ?? true;
  const priceAssisted = settings?.price_assisted_wash_credits ?? 10;
  const enableFull = settings?.enable_full_grooming ?? true;
  const priceFull = settings?.price_full_grooming_credits ?? 50;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Impostazioni Sistema</h1>
        <p className="text-sm text-slate-400">Configura la modalità operativa, le capacità e il catalogo servizi del salone.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold">Configurazione Generale</h2>
            </div>
            <p className="text-sm text-slate-400">Determina come il salone accetta le prenotazioni.</p>
          </CardHeader>
          <CardContent>
            <form action={updateSystemSettings} className="space-y-6">
              
              <div className="space-y-3">
                <label className="text-sm font-medium">Modalità Operativa</label>
                <div className="grid gap-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${mode === "HYBRID" ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/60"}`}>
                    <input type="radio" name="mode" value="HYBRID" defaultChecked={mode === "HYBRID"} className="mt-1" />
                    <div>
                      <p className="font-medium text-slate-50">Ibrida (Consigliata)</p>
                      <p className="text-xs text-slate-400">I clienti possono scegliere tra Self-Service e Servizi Assistiti in fase di prenotazione.</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${mode === "SELF_ONLY" ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/60"}`}>
                    <input type="radio" name="mode" value="SELF_ONLY" defaultChecked={mode === "SELF_ONLY"} className="mt-1" />
                    <div>
                      <p className="font-medium text-slate-50">Solo Self-Service</p>
                      <p className="text-xs text-slate-400">Tutte le prenotazioni sono self-service. I servizi assistiti non vengono mostrati ai clienti.</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${mode === "ASSISTED_ONLY" ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/60"}`}>
                    <input type="radio" name="mode" value="ASSISTED_ONLY" defaultChecked={mode === "ASSISTED_ONLY"} className="mt-1" />
                    <div>
                      <p className="font-medium text-slate-50">Solo Assistito / Toelettatura</p>
                      <p className="text-xs text-slate-400">Tutte le prenotazioni richiedono un operatore. Ideale per saloni tradizionali.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-400" />
                  Capacità Staff Simultanea
                </label>
                <p className="text-xs text-slate-400">Quanti cani possono essere serviti in modalità assistita nello stesso momento? Dipende dal numero di toelettatori presenti in turno oggi.</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    name="max_concurrent_assisted" 
                    defaultValue={maxAssisted} 
                    min="0" 
                    max="10" 
                    className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50"
                  />
                  <span className="text-sm text-slate-400">operatori attivi</span>
                </div>
              </div>

              <div className="my-4 h-px bg-slate-800/60" />

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-cyan-400">Catalogo Servizi Staff</h3>
                <p className="text-xs text-slate-400">Configura i servizi che richiedono l'operatore (visibili se in modalità Ibrida o Solo Assistito).</p>
                
                {/* Servizio 1: Lavaggio Assistito */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-50">Lavaggio Assistito</p>
                      <p className="text-[11px] text-slate-400">Il cliente aiuta l'operatore. Il cliente paga anche la vasca al minuto.</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" name="enable_assisted_wash" defaultChecked={enableAssisted} className="peer sr-only" />
                      <div className="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/30"></div>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-400 w-24">Costo Fisso:</span>
                    <input 
                      type="number" 
                      name="price_assisted_wash_credits" 
                      defaultValue={priceAssisted} 
                      min="0" 
                      className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-50"
                    />
                    <span className="text-xs text-slate-400">crediti</span>
                  </div>
                </div>

                {/* Servizio 2: Toelettatura Completa */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-50">Toelettatura Completa</p>
                      <p className="text-[11px] text-slate-400">Il cliente lascia il cane (Drop-off). Include l'uso della vasca.</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" name="enable_full_grooming" defaultChecked={enableFull} className="peer sr-only" />
                      <div className="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/30"></div>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-400 w-24">Costo Fisso:</span>
                    <input 
                      type="number" 
                      name="price_full_grooming_credits" 
                      defaultValue={priceFull} 
                      min="0" 
                      className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-50"
                    />
                    <span className="text-xs text-slate-400">crediti</span>
                  </div>
                </div>

              </div>

              <Button type="submit" variant="primary" className="w-full">
                Salva Impostazioni
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
