"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CheckCircle2, Clock3, Droplets, Lock, PawPrint, RefreshCw, Sparkles, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { estimateDurationForBundle, getPrimaryService, getServiceSummary, normalizeServiceBundle, serializeServiceBundle, SERVICE_LABELS, type StationType } from "@/lib/booking-planner";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";
import type { Database } from "@/types/database";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type AvailabilityRow = Database["public"]["Functions"]["get_booking_availability"]["Returns"][number];
type PublicSuggestedSlot = {
  key: string;
  stationId: string;
  stationName: string;
  start: Date;
  end: Date;
  label: string;
  availableCount: number;
};

const slotMinutes = 15;
const dayHours = { start: 8, end: 20 };
const calendarDays = 90;
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const serviceOptions: { value: StationType; label: string; subtitle: string; Icon: LucideIcon }[] = [
  { value: "WASH_BASIN", label: "Lavaggio", subtitle: "Bagno completo e rapido", Icon: Sparkles },
  { value: "DRYING_ZONE", label: "Asciugatura", subtitle: "Per il pelo dopo il lavaggio", Icon: Droplets },
  { value: "GROOMING_TABLE", label: "Toelettatura", subtitle: "Per sistemare il cane con calma", Icon: PawPrint }
];

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(d: Date) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function isValidLocalDateParts(day: number, month: number, year: number) {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function pad2(value: string) {
  return value.padStart(2, "0");
}

export default function PrenotaPage() {
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const isConfigured = Boolean(supabase);
  const calendarStart = useMemo(() => startOfLocalDay(new Date()), []);
  const calendar = useMemo(() => Array.from({ length: calendarDays }, (_, i) => addDays(calendarStart, i)), [calendarStart]);

  const [stations, setStations] = useState<Station[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityHint, setAvailabilityHint] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<StationType[]>(["WASH_BASIN"]);
  const [wizardStarted, setWizardStarted] = useState(false);
  const [publicStep, setPublicStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [previewDayKey, setPreviewDayKey] = useState("");
  const [selectedPreviewSlot, setSelectedPreviewSlot] = useState<PublicSuggestedSlot | null>(null);
  const [dayPart, setDayPart] = useState("");
  const [monthPart, setMonthPart] = useState("");
  const [yearPart, setYearPart] = useState("");
  const [showCalendarCard, setShowCalendarCard] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), 1));
  const wheelRef = useRef<HTMLDivElement | null>(null);

  const primaryService = useMemo(() => getPrimaryService(selectedServices), [selectedServices]);
  const publicEstimate = useMemo(() => estimateDurationForBundle(selectedServices, null), [selectedServices]);
  const durationMinutes = publicEstimate.suggestedMinutes;

  const availabilityFrom = useMemo(
    () => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate(), dayHours.start, 0, 0, 0),
    [calendarStart]
  );
  const availabilityTo = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return new Date(last.getFullYear(), last.getMonth(), last.getDate(), dayHours.end, 0, 0, 0);
  }, [calendar, calendarStart]);

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const { data } = await safeGetSession(supabase);
      setIsLogged(Boolean(data.session));
    }
    void checkSession();
  }, [supabase]);

  useEffect(() => {
    async function loadAvailability() {
      if (!supabase) return;
      setLoading(true);
      setAvailabilityHint(null);
      try {
        const { data: stationsData, error: stationsError } = await supabase.from("stations").select("*").order("created_at", { ascending: true });
        if (stationsError) throw stationsError;
        setStations(stationsData ?? []);

        const args = {
          p_from: availabilityFrom.toISOString(),
          p_to: availabilityTo.toISOString()
        } as Database["public"]["Functions"]["get_booking_availability"]["Args"];
        const { data: availData, error: availError } = await supabase.rpc("get_booking_availability", args);
        if (availError) throw availError;
        setAvailability(availData ?? []);
        setAvailabilityLoaded(true);
      } catch (e: any) {
        setAvailabilityLoaded(false);
        const msg = e?.message ?? "Disponibilita non disponibile.";
        const lower = String(msg).toLowerCase();
        setAvailabilityHint(
          msg.includes("get_booking_availability")
            ? "Disponibilita giorni non attiva: esegui la migrazione 0002_booking_availability.sql su Supabase."
            : lower.includes("failed to fetch") || lower.includes("fetch failed") || lower.includes("name not resolved") || lower.includes("dns")
              ? "Connessione a Supabase non riuscita. Controlla URL e chiavi del progetto e riavvia il server."
              : msg
        );
      } finally {
        setLoading(false);
      }
    }

    if (!supabase) return;
    void loadAvailability();
  }, [availabilityFrom, availabilityTo, supabase]);

  const stationsForService = useMemo(
    () => stations.filter((station) => station.type === primaryService && station.status === "AVAILABLE"),
    [primaryService, stations]
  );

  const availabilityByStation = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date }[]>();
    for (const row of availability) {
      const arr = map.get(row.station_id) ?? [];
      arr.push({ start: new Date(row.start_time), end: new Date(row.end_time) });
      map.set(row.station_id, arr);
    }
    for (const [stationId, arr] of map.entries()) {
      arr.sort((a, b) => a.start.getTime() - b.start.getTime());
      map.set(stationId, arr);
    }
    return map;
  }, [availability]);

  const weekTimeWindows = useMemo(() => {
    const startSlotsCount = Math.max(0, Math.floor(((dayHours.end - dayHours.start) * 60 - durationMinutes) / slotMinutes) + 1);

    return calendar.map((day) => {
      const key = ymd(day);
      const label = day.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "short" });
      const businessStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayHours.start, 0, 0, 0);

      if (!availabilityLoaded || !stationsForService.length || startSlotsCount === 0) {
        return { key, label, ranges: [] as { from: string; to: string }[], available: false };
      }

      const ranges: { from: string; to: string }[] = [];
      for (let i = 0; i < startSlotsCount; i++) {
        const start = addMinutes(businessStart, i * slotMinutes);
        const end = addMinutes(start, durationMinutes);
        const anyFree = stationsForService.some((station) => {
          const intervals = availabilityByStation.get(station.id) ?? [];
          return !intervals.some((it) => overlaps(start, end, it.start, it.end));
        });
        if (anyFree) {
          ranges.push({ from: hhmm(start), to: hhmm(end) });
        }
      }

      return { key, label, ranges, available: ranges.length > 0 };
    });
  }, [availabilityByStation, availabilityLoaded, calendar, durationMinutes, stationsForService]);

  const availableDaysSet = useMemo(() => {
    return new Set(weekTimeWindows.filter((w) => w.available).map((w) => w.key));
  }, [weekTimeWindows]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDay = (key: string) => {
    setPreviewDayKey(key);
  };

  const { calendarYear, calendarMonth, offset, daysInMonth } = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const tot = new Date(y, m + 1, 0).getDate();
    const firstDay = new Date(y, m, 1).getDay();
    const off = firstDay === 0 ? 6 : firstDay - 1;
    return {
      calendarYear: y,
      calendarMonth: m,
      offset: off,
      daysInMonth: Array.from({ length: tot }, (_, i) => i + 1)
    };
  }, [currentMonth]);

  const suggestedDayKey = useMemo(() => {
    return weekTimeWindows.find((day) => day.available)?.key ?? weekTimeWindows[0]?.key ?? ymd(calendarStart);
  }, [calendarStart, weekTimeWindows]);

  useEffect(() => {
    if (!previewDayKey || !weekTimeWindows.some((item) => item.key === previewDayKey)) {
      setPreviewDayKey(suggestedDayKey);
    }
  }, [previewDayKey, suggestedDayKey, weekTimeWindows]);

  const selectedPreviewDay = useMemo(() => {
    return weekTimeWindows.find((day) => day.key === previewDayKey) ?? weekTimeWindows[0] ?? null;
  }, [previewDayKey, weekTimeWindows]);

  const publicSuggestedSlots = useMemo(() => {
    const results: PublicSuggestedSlot[] = [];
    if (!selectedPreviewDay || !stationsForService.length) return results;

    const selectedDate = startOfLocalDay(new Date(`${selectedPreviewDay.key}T00:00:00`));
    const businessStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), dayHours.start, 0, 0, 0);
    const startSlotsCount = Math.max(0, Math.floor(((dayHours.end - dayHours.start) * 60 - durationMinutes) / slotMinutes) + 1);

    for (let i = 0; i < startSlotsCount; i++) {
      const start = addMinutes(businessStart, i * slotMinutes);
      const end = addMinutes(start, durationMinutes);
      const freeStations = stationsForService.filter((station) => {
        const intervals = availabilityByStation.get(station.id) ?? [];
        return !intervals.some((it) => overlaps(start, end, it.start, it.end));
      });
      if (!freeStations.length) continue;

      const first = freeStations[0];
      if (!first) continue;
      results.push({
        key: `${selectedPreviewDay.key}-${first.id}-${start.toISOString()}`,
        stationId: first.id,
        stationName: first.name,
        start,
        end,
        label: hhmm(start),
        availableCount: freeStations.length
      });
    }

    return results;
  }, [availabilityByStation, durationMinutes, selectedPreviewDay, stationsForService]);

  useEffect(() => {
    setSelectedPreviewSlot((current) => {
      if (!current) return publicSuggestedSlots[0] ?? null;
      return publicSuggestedSlots.find((slot) => slot.key === current.key) ?? publicSuggestedSlots[0] ?? null;
    });
  }, [publicSuggestedSlots]);

  const bookingIntentHref = useMemo(() => {
    const params = new URLSearchParams({
      services: serializeServiceBundle(selectedServices),
      duration: String(durationMinutes),
      day: previewDayKey || suggestedDayKey
    });
    if (selectedPreviewSlot) {
      params.set("time", selectedPreviewSlot.label);
    }
    return `/prenota/nuova?${params.toString()}`;
  }, [durationMinutes, previewDayKey, selectedPreviewSlot, selectedServices, suggestedDayKey]);

  const loginIntentHref = useMemo(() => {
    const params = new URLSearchParams({ next: bookingIntentHref });
    return `/login?${params.toString()}`;
  }, [bookingIntentHref]);

  const weekSummary = useMemo(() => {
    if (!availabilityLoaded) return "Carichiamo i giorni liberi in tempo reale.";
    const availableDays = weekTimeWindows.filter((day) => day.available).length;
    if (!availableDays) return "Nessuna disponibilità nei prossimi giorni visibili.";
    return `${availableDays} ${availableDays === 1 ? "giorno libero" : "giorni liberi"} nel calendario disponibile.`;
  }, [availabilityLoaded, weekTimeWindows]);

  const calendarEndKey = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return ymd(last);
  }, [calendar, calendarStart]);

  useEffect(() => {
    const key = previewDayKey || suggestedDayKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const [y, m, d] = key.split("-").map((v) => Number(v));
    if (!y || !m || !d) return;
    setDayPart(String(d).padStart(2, "0"));
    setMonthPart(String(m).padStart(2, "0"));
    setYearPart(String(y));
  }, [previewDayKey, suggestedDayKey]);

  useEffect(() => {
    if (!wheelRef.current || !selectedPreviewSlot) return;
    const index = publicSuggestedSlots.findIndex((slot) => slot.key === selectedPreviewSlot.key);
    if (index < 0) return;
    const targetTop = index * 44;
    wheelRef.current.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [publicSuggestedSlots, selectedPreviewSlot]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / 44);
        const next = publicSuggestedSlots[idx];
        if (next && next.key !== selectedPreviewSlot?.key) {
          setSelectedPreviewSlot(next);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
    };
  }, [publicSuggestedSlots, selectedPreviewSlot?.key]);

  function toggleService(service: StationType) {
    setSelectedServices((current) => {
      if (current.includes(service)) {
        const next = current.filter((item) => item !== service);
        return next.length ? normalizeServiceBundle(next) : current;
      }
      return normalizeServiceBundle([...current, service]);
    });
  }

  if (!isConfigured) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Prenota</h2>
          <p className="text-sm leading-relaxed text-slate-200">
            Disponibilità e prenotazioni richiedono Supabase configurato in <span className="font-medium">.env.local</span>.
          </p>
        </header>
      </div>
    );
  }

  const stepItems: { value: 1 | 2 | 3; label: string }[] = [
    { value: 1, label: "Servizi" },
    { value: 2, label: "Data e Ora" },
    { value: 3, label: isLogged ? "Conferma" : "Accedi" }
  ];

  return (
    <div className="space-y-6 max-w-md mx-auto">
      {/* Hide Scrollbar style utility */}
      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />

      <header className="space-y-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">Prenota senza sforzi</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Seleziona i servizi e visualizza subito gli slot disponibili prima del check-in.
        </p>
      </header>

      <AnimatePresence mode="wait">
        {!wizardStarted ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl">
              <CardHeader className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Come funziona</p>
                <p className="text-xl font-extrabold tracking-tight text-slate-50">Un percorso semplice e lineare</p>
              </CardHeader>
              <CardContent className="grid gap-3 pt-2">
                <div className="rounded-2xl bg-slate-950/30 p-4 ring-1 ring-inset ring-slate-800/60 transition-all duration-200 hover:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-200">1. Scegli uno o più servizi</p>
                  <p className="mt-1 text-xs text-slate-400">Ad esempio lavaggio + asciugatura nella stessa prenotazione guidata.</p>
                </div>
                <div className="rounded-2xl bg-slate-950/30 p-4 ring-1 ring-inset ring-slate-800/60 transition-all duration-200 hover:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-200">2. Guarda i giorni liberi</p>
                  <p className="mt-1 text-xs text-slate-400">Ti mostriamo gli orari in base al servizio principale e al tempo stimato.</p>
                </div>
                <div className="rounded-2xl bg-slate-950/30 p-4 ring-1 ring-inset ring-slate-800/60 transition-all duration-200 hover:bg-slate-950/50">
                  <p className="text-sm font-semibold text-slate-200">3. {isLogged ? "Conferma e continua" : "Accedi e conferma"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {isLogged
                      ? "Sei già dentro: ti accompagniamo direttamente all'ultimo passaggio della prenotazione."
                      : "Dopo il login adattiamo il tempo al tuo cane e completiamo la prenotazione."}
                  </p>
                </div>

                <motion.div whileTap={{ scale: 0.98 }} className="w-full mt-2">
                  <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/15 cursor-pointer" variant="primary" onClick={() => { setWizardStarted(true); setPublicStep(1); }}>
                    <CalendarDays className="h-5 w-5 mr-2" />
                    PRENOTA ORA
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl overflow-hidden">
              <CardHeader className="space-y-3 pb-3 border-b border-slate-800/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-sm font-bold tracking-tight text-slate-200">Nuova Prenotazione</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="md"
                    className="h-8 text-xs text-slate-400 hover:text-slate-200 rounded-xl px-2.5"
                    onClick={() => setWizardStarted(false)}
                  >
                    Annulla
                  </Button>
                </div>
                
                {/* Step Indicators */}
                <div className="grid grid-cols-3 gap-2">
                  {stepItems.map((item) => {
                    const active = publicStep === item.value;
                    const done = publicStep > item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          if (item.value === 1) setPublicStep(1);
                          if (item.value === 2 && selectedServices.length > 0) setPublicStep(2);
                          if (item.value === 3 && selectedServices.length > 0 && selectedPreviewSlot) setPublicStep(3);
                        }}
                        className={cn(
                          "rounded-xl py-2 text-center text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset transition-all duration-200 cursor-pointer",
                          active
                            ? "bg-blue-500/15 text-blue-200 ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.1)]"
                            : done
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                            : "bg-slate-950/40 text-slate-500 ring-slate-800/40"
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </CardHeader>
              
              <CardContent className="pt-4 overflow-hidden relative">
                <AnimatePresence mode="wait">
                  {publicStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 1 di 3</p>
                          <p className="text-lg font-bold text-slate-100">Servizi desiderati</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="md"
                          className="h-9 w-9 p-0 rounded-xl hover:bg-slate-800/50"
                          onClick={() => void (async () => {
                            if (!supabase) return;
                            setLoading(true);
                            try {
                              const { data: stationsData } = await supabase.from("stations").select("*").order("created_at", { ascending: true });
                              setStations(stationsData ?? []);
                              const args = { p_from: availabilityFrom.toISOString(), p_to: availabilityTo.toISOString() } as Database["public"]["Functions"]["get_booking_availability"]["Args"];
                              const { data: availData } = await supabase.rpc("get_booking_availability", args);
                              setAvailability(availData ?? []);
                              setAvailabilityLoaded(true);
                            } finally {
                              setLoading(false);
                            }
                          })()}
                          disabled={loading}
                          aria-label="Ricarica"
                        >
                          <RefreshCw className={cn("h-4 w-4 text-slate-300", loading && "animate-spin")} />
                        </Button>
                      </div>

                      <div className="grid gap-2">
                        {serviceOptions.map(({ value, label, subtitle, Icon }) => {
                          const selected = selectedServices.includes(value);
                          return (
                            <motion.button
                              key={value}
                              type="button"
                              whileTap={{ scale: 0.98 }}
                              onClick={() => toggleService(value)}
                              className={cn(
                                "rounded-2xl p-3 text-left ring-1 ring-inset transition-all duration-200 cursor-pointer flex w-full items-start gap-3",
                                selected
                                  ? "bg-blue-500/10 ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                                  : "bg-slate-950/40 ring-slate-800/80 hover:bg-slate-900/40"
                              )}
                            >
                              <div className={cn(
                                "rounded-xl p-2.5 ring-1 ring-inset transition-colors shrink-0",
                                selected ? "bg-blue-500/20 ring-blue-400/30" : "bg-slate-900 ring-slate-850"
                              )}>
                                <Icon className={cn("h-4 w-4", selected ? "text-blue-200" : "text-slate-300")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-slate-100">{label}</p>
                                  {selected && (
                                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                                      Selezionato
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">{subtitle}</p>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>

                      <div className="rounded-2xl bg-slate-950/50 p-3 ring-1 ring-inset ring-slate-800/80 space-y-0.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hai scelto</p>
                        <p className="text-sm font-bold text-slate-200">{getServiceSummary(selectedServices)}</p>
                        <p className="text-[11px] text-slate-400 pt-0.5 leading-relaxed">
                          Tempo stimato iniziale: <span className="text-blue-400 font-bold">{durationMinutes} minuti</span>.
                          <br/>{"Dopo l'accesso adatteremo il tempo in base al tuo cane."}
                        </p>
                      </div>

                      <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                        <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10" variant="primary" onClick={() => setPublicStep(2)}>
                          Continua con giorno e orario
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}

                  {publicStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 2 di 3</p>
                          <p className="text-lg font-bold text-slate-100">Giorno e orario</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="md"
                          className="h-8 text-xs text-slate-300 hover:text-white rounded-xl bg-slate-900/40 ring-1 ring-inset ring-slate-800/60"
                          onClick={() => setPublicStep(1)}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
                        </Button>
                      </div>

                      <p className="text-xs leading-relaxed text-slate-400 bg-slate-950/30 p-2.5 rounded-xl border border-slate-800/40">{weekSummary}</p>

                      <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-bold text-slate-300">Data della sessione</p>
                          <p className="text-xs text-slate-400 font-semibold">{selectedPreviewDay?.label ?? "—"}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            inputMode="numeric"
                            placeholder="GG"
                            maxLength={2}
                            value={dayPart}
                            className="bg-slate-900/60 border-slate-800 rounded-xl text-center text-sm font-semibold h-10"
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 2);
                              setDayPart(value);
                              const d = Number(value);
                              const m = Number(monthPart);
                              const y = Number(yearPart);
                              if (!isValidLocalDateParts(d, m, y)) return;
                              const key = `${y}-${pad2(String(m))}-${pad2(String(d))}`;
                              if (key >= ymd(calendarStart) && key <= calendarEndKey) setPreviewDayKey(key);
                            }}
                          />
                          <Input
                            inputMode="numeric"
                            placeholder="MM"
                            maxLength={2}
                            value={monthPart}
                            className="bg-slate-900/60 border-slate-800 rounded-xl text-center text-sm font-semibold h-10"
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 2);
                              setMonthPart(value);
                              const d = Number(dayPart);
                              const m = Number(value);
                              const y = Number(yearPart);
                              if (!isValidLocalDateParts(d, m, y)) return;
                              const key = `${y}-${pad2(String(m))}-${pad2(String(d))}`;
                              if (key >= ymd(calendarStart) && key <= calendarEndKey) setPreviewDayKey(key);
                            }}
                          />
                          <Input
                            inputMode="numeric"
                            placeholder="AAAA"
                            maxLength={4}
                            value={yearPart}
                            className="bg-slate-900/60 border-slate-800 rounded-xl text-center text-sm font-semibold h-10"
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                              setYearPart(value);
                              const d = Number(dayPart);
                              const m = Number(monthPart);
                              const y = Number(value);
                              if (!isValidLocalDateParts(d, m, y)) return;
                              const key = `${y}-${pad2(String(m))}-${pad2(String(d))}`;
                              if (key >= ymd(calendarStart) && key <= calendarEndKey) setPreviewDayKey(key);
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <Button type="button" variant="secondary" size="md" className="h-8 text-[11px] rounded-lg bg-slate-900 border-slate-800" onClick={() => setShowCalendarCard((v) => !v)}>
                            {showCalendarCard ? "Nascondi calendario" : "Sfoglia calendario"}
                          </Button>
                        </div>

                        {showCalendarCard && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pt-1 overflow-hidden"
                          >
                            <div className="rounded-2xl bg-slate-950/60 p-3 border border-slate-800/80 space-y-3">
                              {/* Header navigazione */}
                              <div className="flex items-center justify-between">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  className="h-7 w-7 p-0 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
                                  onClick={handlePrevMonth}
                                  disabled={currentMonth.getFullYear() === calendarStart.getFullYear() && currentMonth.getMonth() === calendarStart.getMonth()}
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <p className="text-xs font-bold text-slate-200 capitalize tracking-wide">
                                  {currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                                </p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="md"
                                  className="h-7 w-7 p-0 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
                                  onClick={handleNextMonth}
                                  disabled={
                                    calendar[calendar.length - 1]
                                      ? currentMonth.getFullYear() === calendar[calendar.length - 1]!.getFullYear() &&
                                        currentMonth.getMonth() === calendar[calendar.length - 1]!.getMonth()
                                      : false
                                  }
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Giorni della settimana */}
                              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {WEEKDAYS.map((dayName) => (
                                  <div key={dayName}>{dayName}</div>
                                ))}
                              </div>

                              {/* Griglia dei giorni */}
                              <div className="grid grid-cols-7 gap-1 text-center">
                                {/* Giorni vuoti all'inizio */}
                                {Array.from({ length: offset }).map((_, idx) => (
                                  <div key={`empty-${idx}`} className="h-8 w-8" />
                                ))}
                                {/* Giorni del mese */}
                                {daysInMonth.map((d) => {
                                  const cellDate = new Date(calendarYear, calendarMonth, d);
                                  const cellKey = ymd(cellDate);
                                  
                                  const isBeforeStart = cellKey < ymd(calendarStart);
                                  const isAfterEnd = cellKey > calendarEndKey;
                                  const isAvailable = availableDaysSet.has(cellKey);
                                  const isDisabled = isBeforeStart || isAfterEnd || !isAvailable;
                                  const isSelected = cellKey === (previewDayKey || suggestedDayKey);
                                  const isToday = cellKey === ymd(new Date());

                                  return (
                                    <button
                                      key={d}
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={() => handleSelectDay(cellKey)}
                                      className={cn(
                                        "h-8 w-8 text-xs rounded-xl flex items-center justify-center mx-auto transition-all relative cursor-pointer",
                                        isSelected
                                          ? "bg-blue-600 text-slate-50 font-bold shadow-md shadow-blue-600/30 scale-105"
                                          : isToday && !isDisabled
                                          ? "border border-blue-500/30 text-blue-400 font-semibold hover:bg-slate-800/40"
                                          : !isDisabled
                                          ? "text-slate-200 hover:bg-slate-800/40"
                                          : "text-slate-650 opacity-20 pointer-events-none"
                                      )}
                                    >
                                      <span className="relative flex flex-col items-center justify-center w-full h-full">
                                        <span className={cn(isSelected && "translate-y-[-2px]")}>{d}</span>
                                        {isAvailable && !isSelected && (
                                          <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {availabilityHint && (
                        <div className="rounded-2xl bg-red-950/20 p-3 text-xs text-red-200 border border-red-500/20">
                          {availabilityHint}
                        </div>
                      )}

                      <div className="border border-slate-800/80 bg-slate-950/30 rounded-2xl overflow-hidden shadow-inner">
                        <div className="p-3 border-b border-slate-800/60 flex items-center justify-between gap-3 bg-slate-900/30">
                          <div>
                            <p className="text-xs font-bold text-slate-300">Orari disponibili</p>
                            <p className="text-[10px] text-slate-400">
                              {durationMinutes} min stimati per {SERVICE_LABELS[primaryService]}
                            </p>
                          </div>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                            publicSuggestedSlots.length
                              ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                              : "bg-rose-500/10 text-rose-300 ring-rose-500/20"
                          )}>
                            {publicSuggestedSlots.length ? `${publicSuggestedSlots.length} slot` : "Pieno"}
                          </span>
                        </div>
                        
                        <div className="p-3 bg-slate-900/10">
                          {publicSuggestedSlots.length ? (
                            <div className="relative">
                              {/* Central Highlight Border */}
                              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2">
                                <div className="mx-auto h-10 w-full rounded-xl bg-blue-500/10 ring-1 ring-inset ring-blue-500/20" />
                              </div>
                              {/* 3D Wheel Scroll Effect Mask */}
                              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-slate-900/60 to-transparent pointer-events-none z-10" />
                              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-900/60 to-transparent pointer-events-none z-10" />

                              <div
                                ref={wheelRef}
                                className="h-32 snap-y snap-mandatory overflow-y-auto py-11 scrollbar-none"
                                style={{ scrollbarWidth: "none" }}
                              >
                                {publicSuggestedSlots.map((slot) => {
                                  const selected = selectedPreviewSlot?.key === slot.key;
                                  return (
                                    <button
                                      key={slot.key}
                                      type="button"
                                      onClick={() => setSelectedPreviewSlot(slot)}
                                      className={cn(
                                        "flex h-[40px] w-full snap-center items-center justify-between gap-3 px-3 text-left transition-all duration-150 cursor-pointer",
                                        selected ? "text-blue-300 font-bold scale-[1.01]" : "text-slate-400 hover:text-slate-200"
                                      )}
                                    >
                                      <span className="text-sm tracking-tight">{slot.label}</span>
                                      <span className="text-[10px] opacity-70">
                                        {slot.availableCount > 1 ? `${slot.availableCount} postazioni` : slot.stationName}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="py-6 text-center">
                              <p className="text-sm font-semibold text-slate-300">Nessun orario libero</p>
                              <p className="mt-0.5 text-xs text-slate-400">Prova un altro giorno.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80">
                        <div className="flex items-center gap-3">
                          <Clock3 className="h-5 w-5 text-blue-400 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-slate-300">Scelta attuale</p>
                            <p className="text-sm font-semibold text-slate-100">
                              {selectedPreviewDay?.label ?? "Giorno"} alle {selectedPreviewSlot?.label ?? "Seleziona un orario"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                        <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10" variant="primary" onClick={() => setPublicStep(3)} disabled={!selectedPreviewSlot}>
                          Continua alla conferma
                        </Button>
                      </motion.div>
                    </motion.div>
                  )}

                  {publicStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 3 di 3</p>
                          <p className="text-lg font-bold text-slate-100">{isLogged ? "Conferma e continua" : "Accedi e conferma"}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="md"
                          className="h-8 text-xs text-slate-300 hover:text-white rounded-xl bg-slate-900/40 ring-1 ring-inset ring-slate-800/60"
                          onClick={() => setPublicStep(2)}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Indietro
                        </Button>
                      </div>

                      <div className="flex items-start gap-3 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800/80">
                        <div className="mt-0.5 rounded-xl bg-blue-500/10 p-2.5 ring-1 ring-inset ring-blue-500/20 shrink-0">
                          <Lock className="h-4 w-4 text-blue-300" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-slate-100">Dettagli riepilogativi</p>
                          <p className="text-xs text-slate-300 leading-relaxed pt-0.5">
                            Servizi: <span className="font-semibold text-slate-100">{getServiceSummary(selectedServices)}</span>
                            <br/>Tempo: <span className="font-semibold text-slate-100">{durationMinutes} min stimati</span>
                            <br/>Giorno: <span className="font-semibold text-slate-100">{selectedPreviewDay?.label}</span> alle <span className="font-semibold text-slate-100">{selectedPreviewSlot?.label}</span>
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800/80">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-slate-100">
                              {isLogged ? "Tutto pronto per confermare" : "Fase di autenticazione"}
                            </p>
                            <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                              {isLogged
                                ? "Verrai reindirizzato direttamente alla compilazione finale con il tuo cane."
                                : "Ti chiederemo di accedere per associare la prenotazione al tuo cane e completare l'addebito crediti."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                        {isLogged ? (
                          <Link href={bookingIntentHref as Route} className="block w-full">
                            <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10 cursor-pointer" variant="primary" disabled={loading}>
                              <CalendarDays className="h-5 w-5 mr-2" />
                              Continua prenotazione
                            </Button>
                          </Link>
                        ) : (
                          <Link href={loginIntentHref as Route} className="block w-full">
                            <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10 cursor-pointer" variant="primary" disabled={loading}>
                              <CalendarDays className="h-5 w-5 mr-2" />
                              Accedi per prenotare
                            </Button>
                          </Link>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
