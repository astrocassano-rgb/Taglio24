"use client";

import { useState } from "react";
import { createTenantStationAction, deleteTenantStationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LayoutGrid, Plus, Trash2, Loader2, Info } from "lucide-react";
import { Toaster, toast } from "sonner";

interface Station {
  id: string;
  name: string;
  type: "WASH_BASIN" | "DRYING_ZONE" | "GROOMING_TABLE";
  status: string;
  cost_per_minute: number;
  layout_zone: string;
}

interface TenantStationsCardProps {
  tenantId: string;
  initialStations: Station[];
}

function getStationTypeLabel(type: Station["type"]) {
  if (type === "WASH_BASIN") return "Lavaggio";
  if (type === "DRYING_ZONE") return "Asciugatura";
  return "Toelettatura";
}

function getStatusBadge(status: string) {
  if (status === "AVAILABLE") return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20";
  if (status === "OCCUPIED") return "bg-amber-500/15 text-amber-300 ring-amber-500/20";
  return "bg-rose-500/15 text-rose-300 ring-rose-500/20";
}

export function TenantStationsCard({ tenantId, initialStations }: TenantStationsCardProps) {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [name, setName] = useState("");
  const [type, setType] = useState<Station["type"]>("WASH_BASIN");
  const [cost, setCost] = useState("1.0");
  
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const costVal = Number(cost.replace(",", "."));
    if (isNaN(costVal) || costVal <= 0) {
      toast.error("Il costo al minuto deve essere maggiore di 0.");
      return;
    }

    setLoading(true);

    try {
      const result = await createTenantStationAction(tenantId, name.trim(), type, costVal);

      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Postazione aggiunta con successo!");
        setName("");
        setCost("1.0");
        // Ricarica locale (aggiungiamo ottimisticamente il record temporaneo fino al prossimo refresh)
        const tempId = Math.random().toString();
        let layout_zone = "Area Servizio";
        if (type === "WASH_BASIN") layout_zone = "Area Lavaggio";
        else if (type === "DRYING_ZONE") layout_zone = "Area Asciugatura";
        else if (type === "GROOMING_TABLE") layout_zone = "Area Toelettatura";

        setStations([
          ...stations,
          {
            id: tempId,
            name: name.trim(),
            type,
            status: "AVAILABLE",
            cost_per_minute: costVal,
            layout_zone,
          },
        ]);
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'aggiunta della postazione.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStation = async (stationId: string, stationName: string) => {
    if (!confirm(`Sei sicuro di voler eliminare la postazione "${stationName}"?`)) return;
    setDeletingId(stationId);
    try {
      const result = await deleteTenantStationAction(tenantId, stationId);

      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success(`Postazione "${stationName}" eliminata.`);
        setStations(stations.filter((s) => s.id !== stationId));
      }
    } catch (err: any) {
      toast.error(err?.message || "Errore durante l'eliminazione.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-md max-w-xl mx-auto mt-6">
      <Toaster richColors theme="dark" position="bottom-right" />
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="rounded-xl p-2.5 bg-blue-500/15 text-blue-300">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-50">Postazioni Attive</h3>
          <p className="text-xs text-slate-500">Gestisci i moduli fisici installati in questo salone.</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Modulo di creazione */}
        <form onSubmit={handleAddStation} className="space-y-3 rounded-2xl bg-slate-900/40 p-4 ring-1 ring-inset ring-slate-800/80">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nuova Postazione</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="station-name" className="text-xs">Nome</Label>
              <Input
                id="station-name"
                placeholder="es. Lavaggio 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="station-type" className="text-xs">Tipo</Label>
              <select
                id="station-type"
                value={type}
                onChange={(e) => setType(e.target.value as Station["type"])}
                disabled={loading}
                className="h-9 w-full rounded-xl bg-slate-950 px-3 text-xs text-slate-50 ring-1 ring-inset ring-slate-800"
              >
                <option value="WASH_BASIN">Lavaggio</option>
                <option value="DRYING_ZONE">Asciugatura</option>
                <option value="GROOMING_TABLE">Toelettatura</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="station-cost" className="text-xs">Costo/minuto</Label>
              <Input
                id="station-cost"
                placeholder="1.0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                disabled={loading}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={loading || !name.trim()} className="gap-1.5 h-9 rounded-xl px-4 text-xs font-semibold">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Aggiungi
            </Button>
          </div>
        </form>

        {/* Lista postazioni */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Elenco Postazioni ({stations.length})</p>
          {stations.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-slate-900/20 border border-slate-800/80 px-4 py-3 text-xs text-slate-400">
              <Info className="h-4 w-4 text-slate-500 shrink-0" />
              Nessuna postazione configurata per questo salone.
            </div>
          ) : (
            <div className="divide-y divide-slate-900 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/20">
              {stations.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/20 transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{s.name}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.2 text-[9px] font-semibold ring-1 ring-inset ${getStatusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {getStationTypeLabel(s.type)} · {s.cost_per_minute} crediti/min · {s.layout_zone}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => handleDeleteStation(s.id, s.name)}
                    disabled={deletingId === s.id}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-xl"
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
