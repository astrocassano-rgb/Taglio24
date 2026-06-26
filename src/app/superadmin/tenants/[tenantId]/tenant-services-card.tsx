"use client";

import { useState } from "react";
import { createTenantServiceAction, updateTenantServiceAction, deleteTenantServiceAction } from "./actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, Plus, Trash2, Loader2, Info, EyeOff, RefreshCw } from "lucide-react";
import { Toaster, toast } from "sonner";

interface Service {
  id: string;
  name: string;
  description: string | null;
  station_type: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE";
  booking_type: "SELF_SERVICE" | "ASSISTED_WASH" | "FULL_GROOMING";
  fixed_cost_credits: number;
  cost_per_minute_credits: number;
  is_active: boolean;
}

interface TenantServicesCardProps {
  tenantId: string;
  initialServices: Service[];
}

function getBookingTypeLabel(type: Service["booking_type"]) {
  if (type === "SELF_SERVICE") return "Self-Service";
  if (type === "ASSISTED_WASH") return "Assistito";
  return "Toelettatura";
}

function getBookingTypeBadge(type: Service["booking_type"]) {
  if (type === "SELF_SERVICE") return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20";
  if (type === "ASSISTED_WASH") return "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20";
  return "bg-violet-500/15 text-violet-300 ring-violet-500/20";
}

export function TenantServicesCard({ tenantId, initialServices }: TenantServicesCardProps) {
  const [services, setServices] = useState<Service[]>(initialServices);
  
  // States for adding a new service
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stationType, setStationType] = useState<Service["station_type"]>("WASH_BASIN");
  const [bookingType, setBookingType] = useState<Service["booking_type"]>("SELF_SERVICE");
  const [fixedCost, setFixedCost] = useState("0");
  const [costPerMinute, setCostPerMinute] = useState("0");

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const fixedVal = Number(fixedCost.replace(",", "."));
    const minVal = Number(costPerMinute.replace(",", "."));

    if (isNaN(fixedVal) || fixedVal < 0 || isNaN(minVal) || minVal < 0) {
      toast.error("I costi inseriti non sono validi.");
      return;
    }

    setLoading(true);

    try {
      const result = await createTenantServiceAction(
        tenantId,
        name.trim(),
        description.trim(),
        stationType,
        bookingType,
        fixedVal,
        minVal
      );

      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Servizio aggiunto con successo!");
        setName("");
        setDescription("");
        setFixedCost("0");
        setCostPerMinute("0");
        
        // Optimistic update
        setServices([
          ...services,
          {
            id: Math.random().toString(),
            name: name.trim(),
            description: description.trim() || null,
            station_type: stationType,
            booking_type: bookingType,
            fixed_cost_credits: fixedVal,
            cost_per_minute_credits: minVal,
            is_active: true,
          },
        ]);
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'aggiunta del servizio.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (s: Service) => {
    setSavingId(s.id);
    const nextActive = !s.is_active;
    try {
      const result = await updateTenantServiceAction(
        tenantId,
        s.id,
        s.name,
        s.description || "",
        s.station_type,
        s.booking_type,
        s.fixed_cost_credits,
        s.cost_per_minute_credits,
        nextActive
      );

      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Servizio "${s.name}" ${nextActive ? "attivato" : "disattivato"}.`);
        setServices(services.map((item) => (item.id === s.id ? { ...item, is_active: nextActive } : item)));
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'aggiornamento.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteService = async (s: Service) => {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente il servizio "${s.name}"?`)) return;
    setSavingId(s.id);
    try {
      const result = await deleteTenantServiceAction(tenantId, s.id);

      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Servizio "${s.name}" eliminato.`);
        setServices(services.filter((item) => item.id !== s.id));
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'eliminazione.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-md max-w-xl mx-auto mt-6">
      <Toaster richColors theme="dark" position="bottom-right" />
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="rounded-xl p-2.5 bg-cyan-500/15 text-cyan-300">
          <Scissors className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-50">Servizi e Listino</h3>
          <p className="text-xs text-slate-500">Gestisci i servizi offerti e le tariffe del salone.</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Modulo di creazione */}
        <form onSubmit={handleAddService} className="space-y-3 rounded-2xl bg-slate-900/40 p-4 ring-1 ring-inset ring-slate-800/80">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nuovo Servizio</p>
          
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-name" className="text-xs">Nome</Label>
              <Input
                id="service-name"
                placeholder="es. Lavaggio Ozono"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-desc" className="text-xs">Descrizione</Label>
              <Input
                id="service-desc"
                placeholder="es. Trattamento purificante"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-station" className="text-xs">Postazione</Label>
              <select
                id="service-station"
                value={stationType}
                onChange={(e) => setStationType(e.target.value as Service["station_type"])}
                disabled={loading}
                className="h-9 w-full rounded-xl bg-slate-950 px-3 text-xs text-slate-50 ring-1 ring-inset ring-slate-800"
              >
                <option value="WASH_BASIN">Vasca Lavaggio</option>
                <option value="DRYING_ZONE">Zona Asciugatura</option>
                <option value="GROOMING_TABLE">Tavolo Toelettatura</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-booking" className="text-xs">Categoria</Label>
              <select
                id="service-booking"
                value={bookingType}
                onChange={(e) => setBookingType(e.target.value as Service["booking_type"])}
                disabled={loading}
                className="h-9 w-full rounded-xl bg-slate-950 px-3 text-xs text-slate-50 ring-1 ring-inset ring-slate-800"
              >
                <option value="SELF_SERVICE">Self-Service</option>
                <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                <option value="FULL_GROOMING">Toelettatura Completa</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-fixed" className="text-xs">Costo Fisso (crediti)</Label>
              <Input
                id="service-fixed"
                value={fixedCost}
                onChange={(e) => setFixedCost(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-min" className="text-xs">Costo al Minuto (crediti)</Label>
              <Input
                id="service-min"
                value={costPerMinute}
                onChange={(e) => setCostPerMinute(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                placeholder="0 (eredita postazione)"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={loading || !name.trim()} className="gap-1.5 h-9 rounded-xl px-4 text-xs font-semibold">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Aggiungi Servizio
            </Button>
          </div>
        </form>

        {/* Lista dei servizi */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Elenco Servizi ({services.length})</p>
          {services.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/20 border border-slate-800/80 px-4 py-3 text-xs text-slate-400">
              <Info className="h-4 w-4 text-slate-500 shrink-0" />
              Nessun servizio configurato.
            </div>
          ) : (
            <div className="divide-y divide-slate-900 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/20">
              {services.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/20 transition-colors">
                  <div className="space-y-0.5 max-w-[70%]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{s.name}</span>
                      {!s.is_active && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-2 py-0.2 text-[8px] font-semibold text-slate-400">
                          <EyeOff className="h-2 w-2" /> Disattivo
                        </span>
                      )}
                      <span className={`inline-flex rounded-full px-2 py-0.2 text-[9px] font-semibold ring-1 ring-inset ${getBookingTypeBadge(s.booking_type)}`}>
                        {getBookingTypeLabel(s.booking_type)}
                      </span>
                    </div>
                    {s.description && <p className="text-xs text-slate-400 truncate">{s.description}</p>}
                    <p className="text-[10px] text-slate-500">
                      Costo operatore: {s.fixed_cost_credits} crediti · Tariffa minuto: {s.cost_per_minute_credits > 0 ? `${s.cost_per_minute_credits} c` : "Ereditata da postazione"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => handleToggleActive(s)}
                      disabled={savingId === s.id}
                      className="h-8 px-2 text-[10px] font-medium border-slate-800 rounded-xl"
                    >
                      {savingId === s.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : s.is_active ? (
                        "Disattiva"
                      ) : (
                        "Attiva"
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleDeleteService(s)}
                      disabled={savingId === s.id}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl"
                    >
                      {savingId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
