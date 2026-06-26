"use client";

import { useState } from "react";
import { createServiceAction, updateServiceAction, deleteServiceAction } from "./actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, Plus, Trash2, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { Database } from "@/types/database";

type StationType = Database["public"]["Enums"]["station_type"];
type BookingServiceType = Database["public"]["Enums"]["booking_service_type"];

interface Service {
  id: string;
  name: string;
  description: string | null;
  station_type: StationType;
  booking_type: BookingServiceType;
  fixed_cost_credits: number;
  cost_per_minute_credits: number;
  is_active: boolean;
}

interface ServicesManagerProps {
  initialServices: Service[];
}

function getBookingTypeLabel(type: BookingServiceType) {
  if (type === "SELF_SERVICE") return "Self-Service";
  if (type === "ASSISTED_WASH") return "Assistito";
  return "Toelettatura";
}

function getBookingTypeBadge(type: BookingServiceType) {
  if (type === "SELF_SERVICE") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (type === "ASSISTED_WASH") return "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30";
  return "bg-violet-500/15 text-violet-200 ring-violet-500/30";
}

function getStationTypeLabel(type: StationType) {
  if (type === "WASH_BASIN") return "Vasca Lavaggio";
  if (type === "DRYING_ZONE") return "Zona Asciugatura";
  return "Tavolo Toelettatura";
}

export function ServicesManager({ initialServices }: ServicesManagerProps) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [selectedId, setSelectedId] = useState<string>(initialServices[0]?.id ?? "");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Form states for creating a new service
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stationType, setStationType] = useState<StationType>("WASH_BASIN");
  const [bookingType, setBookingType] = useState<BookingServiceType>("SELF_SERVICE");
  const [fixedCost, setFixedCost] = useState("0");
  const [costPerMinute, setCostPerMinute] = useState("0");
  const [isPending, setIsPending] = useState(false);

  const selectedService = services.find((s) => s.id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsPending(true);
    const fixed = Number(fixedCost.replace(",", "."));
    const perMin = Number(costPerMinute.replace(",", "."));

    if (isNaN(fixed) || fixed < 0 || isNaN(perMin) || perMin < 0) {
      toast.error("I costi inseriti non sono validi.");
      setIsPending(false);
      return;
    }

    try {
      const res = await createServiceAction(name.trim(), description.trim(), stationType, bookingType, fixed, perMin);
      if (res && "error" in res) {
        toast.error(res.error);
      } else {
        toast.success("Servizio creato con successo!");
        setIsCreating(false);
        setName("");
        setDescription("");
        setFixedCost("0");
        setCostPerMinute("0");
        // Reload page or force state refresh
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || "Errore imprevisto.");
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdate = async (s: Service) => {
    setSavingId(s.id);
    try {
      const res = await updateServiceAction(
        s.id,
        s.name,
        s.description || "",
        s.station_type,
        s.booking_type,
        s.fixed_cost_credits,
        s.cost_per_minute_credits,
        s.is_active
      );
      if (res && "error" in res) {
        toast.error(res.error);
      } else {
        toast.success(`Servizio "${s.name}" salvato.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Errore imprevisto.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (s: Service) => {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente il servizio "${s.name}"?`)) return;
    setSavingId(s.id);
    try {
      const res = await deleteServiceAction(s.id);
      if (res && "error" in res) {
        toast.error(res.error);
      } else {
        toast.success(`Servizio "${s.name}" eliminato.`);
        const remaining = services.filter((item) => item.id !== s.id);
        setServices(remaining);
        if (remaining.length > 0) {
          setSelectedId(remaining[0]?.id ?? "");
        } else {
          setSelectedId("");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Errore imprevisto.");
    } finally {
      setSavingId(null);
    }
  };

  const updateLocalService = (id: string, patch: Partial<Service>) => {
    setServices((curr) => curr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-6">
      <Toaster richColors theme="dark" position="bottom-right" />
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Services list */}
        <Card className="overflow-hidden border-slate-800 bg-slate-950/40 backdrop-blur-md">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-900 pb-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Listino Salone</p>
              <h3 className="text-lg font-semibold tracking-tight text-slate-50">Elenco Servizi Disponibili</h3>
            </div>
            {!isCreating && (
              <Button
                variant="primary"
                onClick={() => setIsCreating(true)}
                className="gap-1.5 h-9 rounded-xl px-4 text-xs font-semibold"
              >
                <Plus className="h-4 w-4" />
                Aggiungi Servizio
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            {isCreating ? (
              <form onSubmit={handleCreate} className="space-y-4 max-w-lg mx-auto">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-cyan-400">Nuovo Servizio</h4>
                  <Button variant="secondary" onClick={() => setIsCreating(false)} className="h-7 text-[11px] rounded-lg">
                    Torna alla lista
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new-name">Nome Servizio</Label>
                  <Input
                    id="new-name"
                    placeholder="es. Bagno Igienizzante all'Argilla"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isPending}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new-description">Descrizione</Label>
                  <Input
                    id="new-description"
                    placeholder="es. Trattamento purificante ideale per pelli sensibili."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isPending}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-station-type">Postazione Fisica</Label>
                    <select
                      id="new-station-type"
                      value={stationType}
                      onChange={(e) => setStationType(e.target.value as StationType)}
                      disabled={isPending}
                      className="h-10 w-full rounded-xl bg-slate-950 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800 focus:outline-none"
                    >
                      <option value="WASH_BASIN">Vasca Lavaggio</option>
                      <option value="DRYING_ZONE">Zona Asciugatura</option>
                      <option value="GROOMING_TABLE">Tavolo Toelettatura</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="new-booking-type">Categoria Logica</Label>
                    <select
                      id="new-booking-type"
                      value={bookingType}
                      onChange={(e) => setBookingType(e.target.value as BookingServiceType)}
                      disabled={isPending}
                      className="h-10 w-full rounded-xl bg-slate-950 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800 focus:outline-none"
                    >
                      <option value="SELF_SERVICE">Self-Service</option>
                      <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                      <option value="FULL_GROOMING">Toelettatura Completa</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-fixed-cost">Costo Fisso Operatore (crediti)</Label>
                    <Input
                      id="new-fixed-cost"
                      placeholder="0"
                      value={fixedCost}
                      onChange={(e) => setFixedCost(e.target.value)}
                      disabled={isPending}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="new-cost-minute">Costo al Minuto (crediti)</Label>
                    <Input
                      id="new-cost-minute"
                      placeholder="0 (eredita tariffa postazione)"
                      value={costPerMinute}
                      onChange={(e) => setCostPerMinute(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="submit" disabled={isPending} className="gap-1.5 rounded-xl text-xs font-semibold h-9 px-4">
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Crea Servizio
                  </Button>
                </div>
              </form>
            ) : services.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nessun servizio configurato. Crea il primo per iniziare.</div>
            ) : (
              <div className="space-y-2">
                {services.map((s) => {
                  const isSelected = selectedId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? "border-blue-500/30 bg-blue-500/10 text-slate-50 ring-2 ring-blue-500/20"
                          : "border-white/5 bg-slate-900/30 text-slate-200 hover:bg-slate-900/50"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{s.name}</span>
                          {!s.is_active && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-2 py-0.2 text-[8px] font-semibold text-slate-400">
                              <EyeOff className="h-2 w-2" /> Disattivo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate max-w-md">{s.description || "Nessuna descrizione"}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${getBookingTypeBadge(s.booking_type)}`}>
                          {getBookingTypeLabel(s.booking_type)}
                        </span>
                        <div className="text-right text-xs text-slate-300">
                          {s.fixed_cost_credits > 0 && <p>+{s.fixed_cost_credits} f</p>}
                          {s.cost_per_minute_credits > 0 ? (
                            <p>{s.cost_per_minute_credits} c/min</p>
                          ) : (
                            <p className="text-[10px] text-slate-500">Tariffa Standard</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Editor details */}
        <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-md">
          <CardHeader className="border-b border-slate-900 pb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-xl p-2 bg-cyan-500/15 text-cyan-300">
                <Scissors className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-slate-50">Dettagli Servizio</h3>
                <p className="text-xs text-slate-500">Configura le tariffe e la visibilità.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {!selectedService ? (
              <div className="text-center py-12 text-slate-400">Seleziona un servizio dall&apos;elenco per modificarlo.</div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-1">
                  <Label htmlFor="edit-name">Nome Servizio</Label>
                  <Input
                    id="edit-name"
                    value={selectedService.name}
                    onChange={(e) => updateLocalService(selectedService.id, { name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-description">Descrizione</Label>
                  <Input
                    id="edit-description"
                    value={selectedService.description || ""}
                    onChange={(e) => updateLocalService(selectedService.id, { description: e.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-station">Postazione Fisica</Label>
                    <select
                      id="edit-station"
                      value={selectedService.station_type}
                      onChange={(e) => updateLocalService(selectedService.id, { station_type: e.target.value as StationType })}
                      className="h-10 w-full rounded-xl bg-slate-950 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800 focus:outline-none"
                    >
                      <option value="WASH_BASIN">Vasca Lavaggio</option>
                      <option value="DRYING_ZONE">Zona Asciugatura</option>
                      <option value="GROOMING_TABLE">Tavolo Toelettatura</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-booking-type">Categoria Logica</Label>
                    <select
                      id="edit-booking-type"
                      value={selectedService.booking_type}
                      onChange={(e) => updateLocalService(selectedService.id, { booking_type: e.target.value as BookingServiceType })}
                      className="h-10 w-full rounded-xl bg-slate-950 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800 focus:outline-none"
                    >
                      <option value="SELF_SERVICE">Self-Service</option>
                      <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                      <option value="FULL_GROOMING">Toelettatura Completa</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="edit-fixed">Costo Fisso Operatore (crediti)</Label>
                    <Input
                      id="edit-fixed"
                      value={String(selectedService.fixed_cost_credits)}
                      onChange={(e) => updateLocalService(selectedService.id, { fixed_cost_credits: Number(e.target.value.replace(",", ".")) || 0 })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="edit-min">Costo al Minuto (crediti)</Label>
                    <Input
                      id="edit-min"
                      value={String(selectedService.cost_per_minute_credits)}
                      onChange={(e) => updateLocalService(selectedService.id, { cost_per_minute_credits: Number(e.target.value.replace(",", ".")) || 0 })}
                      placeholder="0 (eredita postazione)"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-900/30 border border-slate-800/80 px-4 py-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium text-slate-200">Servizio Attivo</Label>
                    <p className="text-xs text-slate-400">Se disattivato, non comparirà nella pagina di prenotazione.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateLocalService(selectedService.id, { is_active: !selectedService.is_active })}
                    className={`inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      selectedService.is_active ? "bg-cyan-500" : "bg-slate-800"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        selectedService.is_active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleDelete(selectedService)}
                    disabled={savingId === selectedService.id}
                    className="text-rose-400 hover:text-rose-300 border-rose-500/10 hover:bg-rose-950/20 hover:border-rose-500/20"
                  >
                    {savingId === selectedService.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Elimina
                  </Button>

                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => void handleUpdate(selectedService)}
                    disabled={savingId === selectedService.id}
                    className="gap-1.5"
                  >
                    {savingId === selectedService.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Salva Modifiche
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
