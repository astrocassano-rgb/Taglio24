"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";
import { createStationAction, deleteStationAction } from "./actions";

type Station = Database["public"]["Tables"]["stations"]["Row"];

const zoneOptions = ["Area Lavaggio", "Area Asciugatura", "Area Toelettatura", "Ingresso", "Area Servizio"];

type DragState = {
  stationId: string;
  pointerId: number;
  offsetXPercent: number;
  offsetYPercent: number;
} | null;

function getStatusBadge(status: Station["status"]) {
  if (status === "AVAILABLE") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (status === "OCCUPIED") return "bg-amber-500/15 text-amber-200 ring-amber-500/30";
  return "bg-rose-500/15 text-rose-200 ring-rose-500/30";
}

function getStationTypeLabel(type: Station["type"]) {
  if (type === "WASH_BASIN") return "Lavaggio";
  if (type === "DRYING_ZONE") return "Asciugatura";
  return "Toelettatura";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function StationLayoutEditor({ initialStations }: { initialStations: Station[] }) {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [selectedId, setSelectedId] = useState<string>(initialStations[0]?.id ?? "");
  const [dragState, setDragState] = useState<DragState>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  // Sync state with props
  useEffect(() => {
    setStations(initialStations);
    if (initialStations.length > 0 && !initialStations.some((s) => s.id === selectedId)) {
      setSelectedId(initialStations[0]?.id ?? "");
    }
  }, [initialStations, selectedId]);

  // States for adding a new station
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<Station["type"]>("WASH_BASIN");
  const [newCost, setNewCost] = useState("1.0");
  const [addingError, setAddingError] = useState<string | null>(null);
  const [isAddingPending, setIsAddingPending] = useState(false);


  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedId) ?? stations[0] ?? null,
    [selectedId, stations]
  );

  useEffect(() => {
    if (!dragState) return;
    const currentDrag = dragState;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== currentDrag.pointerId || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const nextX = ((event.clientX - rect.left) / rect.width) * 100 - currentDrag.offsetXPercent;
      const nextY = ((event.clientY - rect.top) / rect.height) * 100 - currentDrag.offsetYPercent;

      setStations((current) =>
        current.map((station) =>
          station.id === currentDrag.stationId
            ? {
                ...station,
                layout_x: clamp(Math.round(nextX), 0, Math.max(0, 100 - station.layout_w)),
                layout_y: clamp(Math.round(nextY), 0, Math.max(0, 100 - station.layout_h))
              }
            : station
        )
      );
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId === currentDrag.pointerId) {
        setDragState(null);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState]);

  function updateStation(stationId: string, patch: Partial<Station>) {
    setStations((current) => current.map((station) => (station.id === stationId ? { ...station, ...patch } : station)));
  }

  function handleMapPointerDown(event: React.PointerEvent<HTMLButtonElement>, station: Station) {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const pointerXPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerYPercent = ((event.clientY - rect.top) / rect.height) * 100;

    setSelectedId(station.id);
    setMessage(null);
    setDragState({
      stationId: station.id,
      pointerId: event.pointerId,
      offsetXPercent: pointerXPercent - station.layout_x,
      offsetYPercent: pointerYPercent - station.layout_y
    });
  }

  async function saveStation(station: Station) {
    setSavingId(station.id);
    setMessage(null);

    const formData = new FormData();
    formData.set("station_id", station.id);
    formData.set("name", station.name);
    formData.set("status", station.status);
    formData.set("cost_per_minute", String(station.cost_per_minute));
    formData.set("layout_zone", station.layout_zone);
    formData.set("layout_x", String(station.layout_x));
    formData.set("layout_y", String(station.layout_y));
    formData.set("layout_w", String(station.layout_w));
    formData.set("layout_h", String(station.layout_h));

    try {
      const response = await fetch("/api/admin/stations/update", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Salvataggio non riuscito.");
        return;
      }

      setMessage(`Postazione "${station.name}" aggiornata.`);
    } catch {
      setMessage("Connessione non riuscita durante il salvataggio.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Piantina</p>
            <p className="text-lg font-semibold tracking-tight">Mappa interattiva della struttura</p>
          </CardHeader>
          <CardContent>
            <div
              ref={mapRef}
              className="relative aspect-[16/10] rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-4"
            >
              <div className="pointer-events-none absolute inset-4 rounded-[calc(1.5rem-1px)] border border-dashed border-slate-700/80" />
              <div className="pointer-events-none absolute inset-x-8 top-6 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                <span>Ingresso</span>
                <span>Area Servizi</span>
              </div>

              {stations.map((station) => {
                const isSelected = selectedStation?.id === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    className={`absolute flex flex-col justify-between rounded-2xl border p-3 text-left shadow-lg shadow-slate-950/30 transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                      isSelected ? "border-blue-300/70 ring-2 ring-blue-400/50" : "border-white/10"
                    }`}
                    style={{
                      left: `${station.layout_x}%`,
                      top: `${station.layout_y}%`,
                      width: `${station.layout_w}%`,
                      height: `${station.layout_h}%`
                    }}
                    onClick={() => {
                      setSelectedId(station.id);
                      setMessage(null);
                    }}
                    onPointerDown={(event) => handleMapPointerDown(event, station)}
                  >
                    <div className="space-y-1">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge(station.status)}`}>
                        {station.status}
                      </span>
                      <p className="text-sm font-semibold text-slate-50">{station.name}</p>
                      <p className="text-[11px] text-slate-300">{getStationTypeLabel(station.type)}</p>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      <p>{station.layout_zone}</p>
                      <p>{station.cost_per_minute} crediti/min</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-slate-300">Legenda</p>
            <p className="text-lg font-semibold tracking-tight">Gestione rapida</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <div className="grid gap-2">
              <div className="inline-flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge("AVAILABLE")}`}>AVAILABLE</span>
                <span>Postazione pronta alla prenotazione</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge("OCCUPIED")}`}>OCCUPIED</span>
                <span>Postazione al momento occupata</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${getStatusBadge("MAINTENANCE")}`}>MAINTENANCE</span>
                <span>Postazione esclusa dalle prenotazioni</span>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-inset ring-slate-800">
              <p className="font-medium text-slate-50">Drag-and-drop</p>
              <p className="mt-1">
                Trascina i box nella mappa per spostarli. Puoi poi rifinire i valori `X`, `Y`, `W`, `H` nella scheda dettagli sotto.
              </p>
            </div>

            {message ? <div className="rounded-2xl bg-slate-900/60 p-3 ring-1 ring-inset ring-slate-800">{message}</div> : null}

            <div className="grid gap-2">
              {stations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(station.id);
                    setMessage(null);
                    document.getElementById(`station-${station.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left ring-1 ring-inset transition-colors ${
                    selectedStation?.id === station.id
                      ? "bg-blue-500/10 text-slate-50 ring-blue-400/30"
                      : "bg-slate-900/60 text-slate-50 ring-slate-800 hover:bg-slate-900"
                  }`}
                >
                  <span className="text-sm font-medium">{station.name}</span>
                  <span className="text-xs text-slate-400">{station.layout_zone}</span>
                </button>
              ))}
            </div>

            {/* Aggiungi Postazione Form */}
            <div className="border-t border-slate-800/80 pt-4 mt-2">
              {!isAdding ? (
                <Button
                  variant="secondary"
                  className="w-full gap-2 rounded-xl"
                  onClick={() => {
                    setIsAdding(true);
                    setAddingError(null);
                  }}
                >
                  + Nuova Postazione
                </Button>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAddingError(null);
                    setIsAddingPending(true);
                    const cost = Number(newCost.replace(",", "."));
                    if (!newName.trim()) {
                      setAddingError("Inserisci un nome.");
                      setIsAddingPending(false);
                      return;
                    }
                    if (isNaN(cost) || cost <= 0) {
                      setAddingError("Il costo deve essere maggiore di 0.");
                      setIsAddingPending(false);
                      return;
                    }
                    try {
                      const res = await createStationAction(newName, newType, cost);
                      if (res?.error) {
                        setAddingError(res.error);
                      } else {
                        setIsAdding(false);
                        setNewName("");
                        setNewCost("1.0");
                        setMessage("Nuova postazione creata con successo.");
                      }
                    } catch (err: any) {
                      setAddingError(err.message || "Errore imprevisto.");
                    } finally {
                      setIsAddingPending(false);
                    }
                  }}
                  className="space-y-3 rounded-2xl bg-slate-900/60 p-4 ring-1 ring-inset ring-slate-800"
                >
                  <p className="font-semibold text-slate-100 text-xs uppercase tracking-wider">Aggiungi Postazione</p>
                  
                  <div className="space-y-1">
                    <Label htmlFor="new-name" className="text-xs">Nome</Label>
                    <Input
                      id="new-name"
                      placeholder="es. Vasca Grande"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={isAddingPending}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="new-type" className="text-xs">Tipo</Label>
                    <select
                      id="new-type"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as Station["type"])}
                      disabled={isAddingPending}
                      className="h-10 w-full rounded-xl bg-slate-950 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800"
                    >
                      <option value="WASH_BASIN">Lavaggio</option>
                      <option value="DRYING_ZONE">Asciugatura</option>
                      <option value="GROOMING_TABLE">Toelettatura</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="new-cost" className="text-xs">Costo/minuto (crediti)</Label>
                    <Input
                      id="new-cost"
                      type="text"
                      placeholder="1.0"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      disabled={isAddingPending}
                    />
                  </div>

                  {addingError && (
                    <p className="text-xs text-rose-400 font-medium">{addingError}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      className="flex-1"
                      disabled={isAddingPending}
                    >
                      {isAddingPending ? "Creazione..." : "Crea"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsAdding(false)}
                      disabled={isAddingPending}
                    >
                      Annulla
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-3">
        {stations.map((station) => {
          const isSelected = selectedStation?.id === station.id;
          return (
            <Card key={station.id} id={`station-${station.id}`} className={isSelected ? "border-blue-400/30" : undefined}>
              <CardContent className="space-y-4 pt-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-50">{station.name}</p>
                    <p className="text-xs text-slate-300">
                      {getStationTypeLabel(station.type)} · Stato: {station.status} · {station.layout_zone}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-slate-50">{station.cost_per_minute} crediti/min</div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor={`status-${station.id}`}>Stato</Label>
                    <select
                      id={`status-${station.id}`}
                      value={station.status}
                      onChange={(event) => updateStation(station.id, { status: event.target.value as Station["status"] })}
                      className="h-10 w-full rounded-xl bg-slate-900/70 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800"
                    >
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                      <option value="OCCUPIED">OCCUPIED</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`cost-${station.id}`}>Costo/minuto</Label>
                    <Input
                      id={`cost-${station.id}`}
                      value={String(station.cost_per_minute)}
                      onChange={(event) => updateStation(station.id, { cost_per_minute: Number(event.target.value.replace(",", ".")) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`name-${station.id}`}>Nome</Label>
                    <Input id={`name-${station.id}`} value={station.name} onChange={(event) => updateStation(station.id, { name: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`zone-${station.id}`}>Zona</Label>
                    <select
                      id={`zone-${station.id}`}
                      value={station.layout_zone}
                      onChange={(event) => updateStation(station.id, { layout_zone: event.target.value })}
                      className="h-10 w-full rounded-xl bg-slate-900/70 px-3 text-sm text-slate-50 ring-1 ring-inset ring-slate-800"
                    >
                      {zoneOptions.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor={`x-${station.id}`}>X</Label>
                    <Input
                      id={`x-${station.id}`}
                      type="number"
                      min="0"
                      max="95"
                      step="1"
                      value={String(station.layout_x)}
                      onChange={(event) =>
                        updateStation(station.id, { layout_x: clamp(toInt(event.target.value, station.layout_x), 0, Math.max(0, 100 - station.layout_w)) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`y-${station.id}`}>Y</Label>
                    <Input
                      id={`y-${station.id}`}
                      type="number"
                      min="0"
                      max="95"
                      step="1"
                      value={String(station.layout_y)}
                      onChange={(event) =>
                        updateStation(station.id, { layout_y: clamp(toInt(event.target.value, station.layout_y), 0, Math.max(0, 100 - station.layout_h)) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`w-${station.id}`}>W</Label>
                    <Input
                      id={`w-${station.id}`}
                      type="number"
                      min="8"
                      max="100"
                      step="1"
                      value={String(station.layout_w)}
                      onChange={(event) =>
                        updateStation(station.id, {
                          layout_w: clamp(toInt(event.target.value, station.layout_w), 8, 100),
                          layout_x: clamp(station.layout_x, 0, Math.max(0, 100 - clamp(toInt(event.target.value, station.layout_w), 8, 100)))
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`h-${station.id}`}>H</Label>
                    <Input
                      id={`h-${station.id}`}
                      type="number"
                      min="8"
                      max="100"
                      step="1"
                      value={String(station.layout_h)}
                      onChange={(event) =>
                        updateStation(station.id, {
                          layout_h: clamp(toInt(event.target.value, station.layout_h), 8, 100),
                          layout_y: clamp(station.layout_y, 0, Math.max(0, 100 - clamp(toInt(event.target.value, station.layout_h), 8, 100)))
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Sei sicuro di voler eliminare la postazione "${station.name}"?`)) return;
                      setSavingId(station.id);
                      setMessage(null);
                      try {
                        const res = await deleteStationAction(station.id);
                        if (res?.error) {
                          setMessage(res.error);
                        } else {
                          setMessage(`Postazione "${station.name}" eliminata con successo.`);
                          const remaining = stations.filter((s) => s.id !== station.id);
                          if (remaining.length > 0) {
                            setSelectedId(remaining[0]?.id ?? "");
                          }
                        }
                      } catch (err: any) {
                        setMessage(err.message || "Errore durante l'eliminazione.");
                      } finally {
                        setSavingId(null);
                      }
                    }}
                    disabled={savingId === station.id}
                    className="text-rose-400 hover:text-rose-300 border-rose-500/10 hover:bg-rose-950/20 hover:border-rose-500/20"
                  >
                    {savingId === station.id ? "..." : "Elimina"}
                  </Button>

                  <Button variant="primary" type="button" onClick={() => void saveStation(station)} disabled={savingId === station.id}>
                    {savingId === station.id ? "Salvataggio..." : "Salva postazione"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
