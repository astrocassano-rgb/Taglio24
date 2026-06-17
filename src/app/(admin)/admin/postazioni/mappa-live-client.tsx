"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SessionCountdown } from "@/components/sessions/session-countdown";
import { getSessionEndsAt } from "@/lib/active-sessions";
import { RotateCw, Wrench, CheckCircle2, AlertCircle, Play, Calendar, User, Clock, Plus, Shield } from "lucide-react";
import type { Database } from "@/types/database";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type SessionRow = Database["public"]["Tables"]["active_sessions"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Dog = Database["public"]["Tables"]["dogs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface MappaLiveClientProps {
  initialStations: Station[];
  initialActiveSessions: SessionRow[];
  initialBookings: Booking[];
  initialDogs: Dog[];
  initialProfiles: Profile[];
}

function getStatusBadgeClass(status: Station["status"], hasActiveSession: boolean) {
  if (hasActiveSession) return "bg-cyan-500/15 text-cyan-200 ring-cyan-500/30";
  if (status === "AVAILABLE") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (status === "OCCUPIED") return "bg-amber-500/15 text-amber-200 ring-amber-500/30";
  return "bg-rose-500/15 text-rose-200 ring-rose-500/30";
}

function getStatusBadgeText(status: Station["status"], hasActiveSession: boolean) {
  if (hasActiveSession) return "IN USO ATTIVO";
  if (status === "AVAILABLE") return "LIBERA";
  if (status === "OCCUPIED") return "PRENOTATA / OCCUPATA";
  return "MANUTENZIONE";
}

export function MappaLiveClient({
  initialStations,
  initialActiveSessions,
  initialBookings,
  initialDogs,
  initialProfiles,
}: MappaLiveClientProps) {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [activeSessions, setActiveSessions] = useState<SessionRow[]>(initialActiveSessions);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [dogs, setDogs] = useState<Dog[]>(initialDogs);
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);

  const [selectedStationId, setSelectedStationId] = useState<string | null>(initialStations[0]?.id ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Polling automatico ogni 10 secondi
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshState(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function refreshState(silent = false) {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/stations/live-state");
      if (!res.ok) throw new Error("Errore nel caricamento dello stato");
      const data = await res.json() as {
        stations: Station[];
        activeSessions: SessionRow[];
        bookings: Booking[];
        dogs: Dog[];
        profiles: Profile[];
      };
      setStations(data.stations);
      setActiveSessions(data.activeSessions);
      setBookings(data.bookings);
      setDogs(data.dogs);
      setProfiles(data.profiles);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Errore polling:", err);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }

  const selectedStation = stations.find((s) => s.id === selectedStationId);
  const activeSessionForSelected = selectedStation
    ? activeSessions.find((s) => s.station_id === selectedStation.id)
    : null;
  const bookingForSelected = activeSessionForSelected?.booking_id
    ? bookings.find((b) => b.id === activeSessionForSelected.booking_id)
    : null;
  const dogForSelected = bookingForSelected
    ? dogs.find((d) => d.id === bookingForSelected.dog_id)
    : null;
  const profileForSelected = activeSessionForSelected
    ? profiles.find((p) => p.id === activeSessionForSelected.customer_id)
    : null;

  async function changeStationStatus(status: Station["status"]) {
    if (!selectedStation) return;
    setMessage(null);

    const formData = new FormData();
    formData.set("station_id", selectedStation.id);
    formData.set("name", selectedStation.name);
    formData.set("status", status);
    formData.set("cost_per_minute", String(selectedStation.cost_per_minute));
    formData.set("layout_zone", selectedStation.layout_zone);
    formData.set("layout_x", String(selectedStation.layout_x));
    formData.set("layout_y", String(selectedStation.layout_y));
    formData.set("layout_w", String(selectedStation.layout_w));
    formData.set("layout_h", String(selectedStation.layout_h));

    try {
      const response = await fetch("/api/admin/stations/update", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ text: payload?.error ?? "Salvataggio non riuscito.", type: "error" });
        return;
      }

      setMessage({ text: `Stato postazione "${selectedStation.name}" aggiornato.`, type: "success" });
      await refreshState(true);
    } catch {
      setMessage({ text: "Connessione non riuscita durante il salvataggio.", type: "error" });
    }
  }

  async function stopSession(sessionId: string) {
    if (!confirm("Sei sicuro di voler interrompere questa sessione live? Il cliente perderà l'accesso immediato alla postazione.")) {
      return;
    }
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set("session_id", sessionId);

      const response = await fetch("/api/admin/sessions/stop", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Impossibile arrestare la sessione.");
      }

      setMessage({ text: "Sessione interrotta con successo.", type: "success" });
      await refreshState(false);
    } catch (err: any) {
      setMessage({ text: err.message ?? "Errore.", type: "error" });
    }
  }

  async function extendSessionAdmin(bookingId: string, minutes: number) {
    setMessage(null);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/session/extend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          minutes,
          costCredits: 0, // Staff Override is FREE (0 credits)
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "Errore durante l'estensione della sessione.");
      }

      setMessage({ text: `Sessione estesa di +${minutes} minuti con successo!`, type: "success" });
      await refreshState(false);
    } catch (err: any) {
      setMessage({ text: err.message ?? "Errore.", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra superiore */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl bg-slate-900/40 p-4 ring-1 ring-inset ring-slate-800 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-300">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900 ring-1 ring-slate-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Libera</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900 ring-1 ring-slate-800">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            <span>In Uso Attivo (Live)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900 ring-1 ring-slate-800">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Prenotata / Occupata</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900 ring-1 ring-slate-800">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>Manutenzione</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <span className="text-[11px] text-slate-400">
            Ultimo aggiornamento: {lastUpdated.toLocaleTimeString("it-IT")}
          </span>
          <Button
            variant="secondary"
            size="md"
            onClick={() => void refreshState()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>
      </section>

      {/* Grid Layout Mappa e Dettagli */}
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Contenitore Mappa */}
        <Card className="overflow-hidden border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
          <CardHeader className="space-y-1">
            <p className="text-xs font-medium text-blue-400">Piantina 24H</p>
            <p className="text-lg font-semibold tracking-tight">Mappa occupazione in tempo reale</p>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-[16/10] rounded-3xl border border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(2,6,23,0.9))] p-4">
              <div className="pointer-events-none absolute inset-4 rounded-[calc(1.5rem-1px)] border border-dashed border-slate-800" />

              {stations.map((station) => {
                const session = activeSessions.find((s) => s.station_id === station.id);
                const hasSession = !!session;
                const isSelected = selectedStationId === station.id;

                let borderStyle = "border-white/10 bg-slate-900/50 hover:bg-slate-900/80";
                let pulseGlow = "";

                if (hasSession) {
                  borderStyle = "border-cyan-500/40 bg-cyan-950/15 text-cyan-200";
                  pulseGlow = "shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/30 animate-pulse";
                } else if (station.status === "AVAILABLE") {
                  borderStyle = "border-emerald-500/35 bg-emerald-950/10 text-emerald-100 hover:bg-emerald-950/20";
                } else if (station.status === "OCCUPIED") {
                  borderStyle = "border-amber-500/35 bg-amber-950/10 text-amber-100 hover:bg-amber-950/20";
                } else if (station.status === "MAINTENANCE") {
                  borderStyle = "border-rose-500/35 bg-rose-950/10 text-rose-100 hover:bg-rose-950/20";
                }

                if (isSelected) {
                  borderStyle += " ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950";
                }

                // Trova cane associato alla sessione
                const booking = session?.booking_id ? bookings.find((b) => b.id === session.booking_id) : null;
                const dog = booking ? dogs.find((d) => d.id === booking.dog_id) : null;

                return (
                  <button
                    key={station.id}
                    type="button"
                    className={`absolute flex flex-col justify-between rounded-2xl border p-3.5 text-left shadow-lg transition-all duration-300 hover:scale-[1.01] focus-visible:outline-none ${borderStyle} ${pulseGlow}`}
                    style={{
                      left: `${station.layout_x}%`,
                      top: `${station.layout_y}%`,
                      width: `${station.layout_w}%`,
                      height: `${station.layout_h}%`,
                    }}
                    onClick={() => {
                      setSelectedStationId(station.id);
                      setMessage(null);
                    }}
                  >
                    <div className="space-y-1.5 w-full overflow-hidden">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ring-1 ring-inset ${getStatusBadgeClass(station.status, hasSession)}`}>
                        {getStatusBadgeText(station.status, hasSession)}
                      </span>
                      <p className="text-sm font-semibold truncate text-slate-50">{station.name}</p>
                      {hasSession && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200">
                          <Clock className="h-3 w-3 animate-spin [animation-duration:12s]" />
                          <SessionCountdown activatedAt={session.activated_at} remainingSeconds={session.remaining_seconds} />
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400 mt-2">
                      <p className="font-medium truncate text-slate-300">{station.layout_zone}</p>
                      {dog && <p className="text-cyan-300 font-medium truncate mt-0.5">🐶 {dog.name}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pannello di Controllo Dettagliato */}
        <Card className="border-slate-800 bg-slate-950/40 backdrop-blur-md flex flex-col justify-between">
          <div>
            <CardHeader className="border-b border-slate-900 pb-4">
              <p className="text-xs font-medium text-slate-400">Dettaglio Postazione</p>
              <h3 className="text-lg font-semibold text-slate-50">
                {selectedStation ? selectedStation.name : "Seleziona una postazione"}
              </h3>
            </CardHeader>
            <CardContent className="pt-4 space-y-5 text-sm text-slate-300">
              {selectedStation ? (
                <>
                  {/* Stato generale ed edit rapido */}
                  <div className="space-y-2.5">
                    <Label htmlFor="station-status-select" className="text-slate-400 font-medium">
                      Cambia Stato Operativo
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={selectedStation.status === "AVAILABLE" ? "primary" : "secondary"}
                        size="md"
                        onClick={() => void changeStationStatus("AVAILABLE")}
                        className="text-xs py-1"
                      >
                        Libera
                      </Button>
                      <Button
                        type="button"
                        variant={selectedStation.status === "OCCUPIED" ? "primary" : "secondary"}
                        size="md"
                        onClick={() => void changeStationStatus("OCCUPIED")}
                        className="text-xs py-1"
                      >
                        Occupata
                      </Button>
                      <Button
                        type="button"
                        variant={selectedStation.status === "MAINTENANCE" ? "primary" : "secondary"}
                        size="md"
                        onClick={() => void changeStationStatus("MAINTENANCE")}
                        className="text-xs py-1"
                      >
                        Manutenzione
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-inset ring-slate-800/80 space-y-2">
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Configurazione</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <span className="text-slate-400">Zona:</span>{" "}
                        <span className="text-slate-200 font-medium">{selectedStation.layout_zone}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Tariffa:</span>{" "}
                        <span className="text-slate-200 font-medium">{selectedStation.cost_per_minute} crediti/min</span>
                      </div>
                    </div>
                  </div>

                  {message && (
                    <div
                      className={`rounded-2xl p-3 text-xs font-medium ring-1 ring-inset ${
                        message.type === "success"
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                          : "bg-rose-500/10 text-rose-300 ring-rose-500/25"
                      }`}
                    >
                      {message.text}
                    </div>
                  )}

                  {/* Informazioni Sessione Attiva */}
                  {activeSessionForSelected ? (
                    <div className="border border-cyan-500/30 bg-cyan-950/10 rounded-2xl p-4 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between border-b border-cyan-950 pb-2">
                        <div className="flex items-center gap-2">
                          <Play className="h-4 w-4 text-cyan-400 animate-pulse" />
                          <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">
                            Sessione Attiva
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-cyan-300">
                          <SessionCountdown
                            activatedAt={activeSessionForSelected.activated_at}
                            remainingSeconds={activeSessionForSelected.remaining_seconds}
                          />
                        </span>
                      </div>

                      <div className="space-y-2.5 text-xs">
                        {profileForSelected && (
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            <div>
                              <p className="font-semibold text-slate-100">
                                {[profileForSelected.first_name, profileForSelected.last_name]
                                  .filter(Boolean)
                                  .join(" ") || "Cliente"}
                              </p>
                              <p className="text-[10px] text-slate-400">{profileForSelected.email}</p>
                            </div>
                          </div>
                        )}

                        {dogForSelected && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm">🐶</span>
                            <div>
                              <p className="font-semibold text-slate-100">{dogForSelected.name}</p>
                              {dogForSelected.breed && (
                                <p className="text-[10px] text-slate-400">{dogForSelected.breed} · {dogForSelected.size}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {bookingForSelected && (
                          <>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <div>
                                <p className="font-semibold text-slate-100">Orario Prenotazione</p>
                                <p className="text-[10px] text-slate-400">
                                  {new Date(bookingForSelected.start_time).toLocaleTimeString("it-IT", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  -{" "}
                                  {new Date(bookingForSelected.end_time).toLocaleTimeString("it-IT", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Shield className="h-3.5 w-3.5 text-slate-400" />
                              <div>
                                <p className="font-semibold text-slate-100">Modalità Servizio</p>
                                {bookingForSelected.assisted ? (
                                  <p className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                                    IBRIDO (CON ASSISTENZA OPERATORE)
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400">Self-Service (Fai-da-te)</p>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Bottoni Override Admin */}
                      <div className="space-y-2 pt-2">
                        {bookingForSelected && (
                          <div className="space-y-2">
                            <Label className="text-xs text-cyan-300 font-semibold uppercase tracking-wider block">
                              Staff Override: Estendi Sessione Gratis
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => void extendSessionAdmin(bookingForSelected.id, 10)}
                                className="text-xs inline-flex items-center justify-center gap-1 border-cyan-500/25 hover:bg-cyan-950/20 text-cyan-200"
                              >
                                <Plus className="h-3 w-3" /> +10 Min
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                onClick={() => void extendSessionAdmin(bookingForSelected.id, 30)}
                                className="text-xs inline-flex items-center justify-center gap-1 border-cyan-500/25 hover:bg-cyan-950/20 text-cyan-200"
                              >
                                <Plus className="h-3 w-3" /> +30 Min
                              </Button>
                            </div>
                          </div>
                        )}

                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          onClick={() => void stopSession(activeSessionForSelected.id)}
                          className="w-full text-xs text-rose-300 border-rose-500/20 hover:bg-rose-950/20 mt-2"
                        >
                          Arresta Sessione Live
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-900/30 p-4 ring-1 ring-inset ring-slate-900 border border-slate-800/40 text-center space-y-1">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto" />
                      <p className="font-semibold text-slate-200 text-xs">Nessuna sessione attiva</p>
                      <p className="text-[10px] text-slate-400">
                        La postazione è pronta per essere attivata da una prenotazione cliente.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Seleziona una postazione sulla mappa per visualizzarne i dettagli e gestirla.
                </div>
              )}
            </CardContent>
          </div>
          {selectedStation && (
            <div className="p-4 border-t border-slate-900 text-center text-[10px] text-slate-400 inline-flex items-center justify-center gap-1">
              <Shield className="h-3 w-3 text-blue-400" />
              Strumenti di override amministratore. Tutte le azioni sono registrate.
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
