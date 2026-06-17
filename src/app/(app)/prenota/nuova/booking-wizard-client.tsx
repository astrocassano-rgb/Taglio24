"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CreditCard, Droplets, PawPrint, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { estimateDurationForBundle, getPrimaryService, getServiceSummary, normalizeServiceBundle, parseServiceBundle, SERVICE_LABELS, type StationType } from "@/lib/booking-planner";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import type { Database } from "@/types/database";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type Dog = Database["public"]["Tables"]["dogs"]["Row"];
type AvailabilityRow = Database["public"]["Functions"]["get_booking_availability"]["Returns"][number];
type SuggestedSlot = {
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
const successRedirectDelayMs = 2500;

const serviceOptions: { value: StationType; label: string; subtitle: string; Icon: LucideIcon }[] = [
  { value: "WASH_BASIN", label: "Lavaggio", subtitle: "Per un bagno completo", Icon: Sparkles },
  { value: "DRYING_ZONE", label: "Asciugatura", subtitle: "Per asciugare bene il pelo", Icon: Droplets },
  { value: "GROOMING_TABLE", label: "Toelettatura", subtitle: "Per sistemare il cane con calma", Icon: PawPrint }
];

type Step = 1 | 2 | 3 | 4 | 5;

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

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfLocalDay(new Date());
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? startOfLocalDay(new Date()) : startOfLocalDay(parsed);
}

function parseDuration(value: string | null) {
  const parsed = Number(value);
  return parsed > 0 ? parsed : 0;
}

function parseTime(value: string | null) {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : null;
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

export default function BookingWizardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const isConfigured = Boolean(supabase);

  const initialServices = useMemo(() => {
    const bundle = searchParams?.get("services");
    if (bundle) return parseServiceBundle(bundle);
    const single = searchParams?.get("service");
    return parseServiceBundle(single);
  }, [searchParams]);
  const initialDuration = useMemo(() => parseDuration(searchParams?.get("duration") ?? null), [searchParams]);
  const initialDay = useMemo(() => parseDay(searchParams?.get("day") ?? null), [searchParams]);
  const initialTime = useMemo(() => parseTime(searchParams?.get("time") ?? null), [searchParams]);

  const calendarStart = useMemo(() => startOfLocalDay(new Date()), []);
  const calendar = useMemo(() => Array.from({ length: calendarDays }, (_, i) => addDays(calendarStart, i)), [calendarStart]);
  const availabilityFrom = useMemo(
    () => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate(), dayHours.start, 0, 0, 0),
    [calendarStart]
  );
  const availabilityTo = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return new Date(last.getFullYear(), last.getMonth(), last.getDate(), dayHours.end, 0, 0, 0);
  }, [calendar, calendarStart]);

  const [step, setStep] = useState<Step>(1);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState("");
  const [selectedServices, setSelectedServices] = useState<StationType[]>(initialServices);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [manualDuration, setManualDuration] = useState(false);
  const [day, setDay] = useState<Date>(initialDay);
  const [selectedSlot, setSelectedSlot] = useState<SuggestedSlot | null>(null);
  const [dayPart, setDayPart] = useState("");
  const [monthPart, setMonthPart] = useState("");
  const [yearPart, setYearPart] = useState("");
  const [showCalendarCard, setShowCalendarCard] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), 1));
  const [stations, setStations] = useState<Station[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityHint, setAvailabilityHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successSummary, setSuccessSummary] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  const selectedDog = dogs.find((dog) => dog.id === selectedDogId) ?? null;
  const durationEstimate = useMemo(() => estimateDurationForBundle(selectedServices, selectedDog), [selectedDog, selectedServices]);
  const primaryService = useMemo(() => getPrimaryService(selectedServices), [selectedServices]);
  const bookingCompleted = Boolean(successSummary);

  useEffect(() => {
    setSelectedServices(initialServices);
    setDay(initialDay);
    setSelectedSlot(null);
    setManualDuration(false);
  }, [initialDay, initialServices]);

  useEffect(() => {
    if (manualDuration) return;
    setDurationMinutes(initialDuration > 0 ? initialDuration : durationEstimate.suggestedMinutes);
  }, [durationEstimate.suggestedMinutes, initialDuration, manualDuration]);

  useEffect(() => {
    if (!bookingCompleted) return;
    const timeout = window.setTimeout(() => {
      router.replace("/");
    }, successRedirectDelayMs);
    return () => window.clearTimeout(timeout);
  }, [bookingCompleted, router]);

  const dayStart = useMemo(() => new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayHours.start, 0, 0, 0), [day]);
  const dayEnd = useMemo(() => new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayHours.end, 0, 0, 0), [day]);

  useEffect(() => {
    async function loadDogs() {
      if (!supabase) return;
      const { data } = await supabase.from("dogs").select("*").order("created_at", { ascending: false });
      if (data?.length) {
        setDogs(data);
        setSelectedDogId((current) => current || data[0]?.id || "");
      } else {
        setDogs([]);
        setSelectedDogId("");
      }
    }
    void loadDogs();
  }, [supabase]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [day, durationMinutes, selectedServices]);

  const loadStations = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("stations").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    setStations(data ?? []);
  };

  const loadAvailability = async () => {
    if (!supabase) return;
    const args = {
      p_from: availabilityFrom.toISOString(),
      p_to: availabilityTo.toISOString()
    } as Database["public"]["Functions"]["get_booking_availability"]["Args"];

    const { data, error } = await supabase.rpc("get_booking_availability", args);
    if (error) throw error;
    setAvailability(data ?? []);
    setAvailabilityLoaded(true);
  };

  const loadAll = async () => {
    if (!supabase) return;
    setLoading(true);
    setMessage(null);
    setAvailabilityHint(null);
    try {
      await Promise.all([loadStations(), loadAvailability()]);
    } catch (e: any) {
      setAvailabilityLoaded(false);
      const msg = String(e?.message ?? "Disponibilita non disponibile.");
      setAvailabilityHint(
        msg.includes("get_booking_availability")
          ? "Disponibilita giorni non attiva: esegui la migrazione 0002_booking_availability.sql su Supabase."
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("booking-wizard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void loadAll();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const availabilityByStation = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date }[]>();
    for (const row of availability) {
      const list = map.get(row.station_id) ?? [];
      list.push({ start: new Date(row.start_time), end: new Date(row.end_time) });
      map.set(row.station_id, list);
    }
    for (const [stationId, list] of map.entries()) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
      map.set(stationId, list);
    }
    return map;
  }, [availability]);

  const stationsForService = useMemo(
    () => stations.filter((station) => station.type === primaryService && station.status === "AVAILABLE"),
    [primaryService, stations]
  );

  const availableDaysSet = useMemo(() => {
    const startSlotsCount = Math.max(0, Math.floor(((dayHours.end - dayHours.start) * 60 - durationMinutes) / slotMinutes) + 1);
    const set = new Set<string>();
    if (!availabilityLoaded || !stationsForService.length || startSlotsCount === 0) {
      return set;
    }
    for (const dayItem of calendar) {
      const key = ymd(dayItem);
      const businessStart = new Date(dayItem.getFullYear(), dayItem.getMonth(), dayItem.getDate(), dayHours.start, 0, 0, 0);
      let hasAnySlot = false;
      for (let i = 0; i < startSlotsCount; i++) {
        const start = addMinutes(businessStart, i * slotMinutes);
        const end = addMinutes(start, durationMinutes);
        const anyFree = stationsForService.some((station) => {
          const intervals = availabilityByStation.get(station.id) ?? [];
          return !intervals.some((it) => overlaps(start, end, it.start, it.end));
        });
        if (anyFree) {
          hasAnySlot = true;
          break;
        }
      }
      if (hasAnySlot) {
        set.add(key);
      }
    }
    return set;
  }, [availabilityByStation, availabilityLoaded, calendar, durationMinutes, stationsForService]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDay = (key: string) => {
    setDay(startOfLocalDay(new Date(`${key}T00:00:00`)));
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

  const suggestedSlots = useMemo(() => {
    const results: SuggestedSlot[] = [];
    if (!stationsForService.length) return results;

    const startSlotsCount = Math.max(0, Math.floor(((dayHours.end - dayHours.start) * 60 - durationMinutes) / slotMinutes) + 1);
    for (let i = 0; i < startSlotsCount; i++) {
      const start = addMinutes(dayStart, i * slotMinutes);
      const end = addMinutes(start, durationMinutes);
      const freeStations = stationsForService.filter((station) => {
        const intervals = availabilityByStation.get(station.id) ?? [];
        return !intervals.some((it) => overlaps(start, end, it.start, it.end));
      });
      if (!freeStations.length) continue;
      const first = freeStations[0];
      if (!first) continue;
      results.push({
        key: `${first.id}-${start.toISOString()}`,
        stationId: first.id,
        stationName: first.name,
        start,
        end,
        label: hhmm(start),
        availableCount: freeStations.length
      });
    }

    return results;
  }, [availabilityByStation, dayStart, durationMinutes, stationsForService]);

  useEffect(() => {
    setSelectedSlot((current) => {
      if (current) {
        return suggestedSlots.find((slot) => slot.key === current.key) ?? null;
      }
      if (initialTime) {
        return suggestedSlots.find((slot) => slot.label === initialTime) ?? suggestedSlots[0] ?? null;
      }
      return suggestedSlots[0] ?? null;
    });
  }, [initialTime, suggestedSlots]);

  const selectedDayLabel = useMemo(() => day.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" }), [day]);

  const calendarStartKey = useMemo(() => ymd(calendarStart), [calendarStart]);
  const calendarEndKey = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return ymd(last);
  }, [calendar, calendarStart]);

  useEffect(() => {
    setDayPart(String(day.getDate()).padStart(2, "0"));
    setMonthPart(String(day.getMonth() + 1).padStart(2, "0"));
    setYearPart(String(day.getFullYear()));
  }, [day]);

  useEffect(() => {
    if (!wheelRef.current || !selectedSlot) return;
    const index = suggestedSlots.findIndex((slot) => slot.key === selectedSlot.key);
    if (index < 0) return;
    wheelRef.current.scrollTo({ top: index * 40, behavior: "smooth" });
  }, [selectedSlot, suggestedSlots]);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / 40);
        const next = suggestedSlots[idx];
        if (next && next.key !== selectedSlot?.key) {
          setSelectedSlot(next);
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
    };
  }, [selectedSlot?.key, suggestedSlots]);

  const stepItems: { value: Step; label: string }[] = [
    { value: 1, label: "Cane" },
    { value: 2, label: "Servizi" },
    { value: 3, label: "Tempo" },
    { value: 4, label: "Orario" },
    { value: 5, label: "Conferma" }
  ];

  function toggleService(service: StationType) {
    setSelectedServices((current) => {
      if (current.includes(service)) {
        const next = current.filter((item) => item !== service);
        return next.length ? normalizeServiceBundle(next) : current;
      }
      return normalizeServiceBundle([...current, service]);
    });
    setManualDuration(false);
  }

  const goToStep = (next: Step) => {
    if (bookingCompleted) return;
    if (next === 2 && !selectedDogId) return;
    if (next === 3 && !selectedServices.length) return setStep(2);
    if (next === 4 && !durationMinutes) return setStep(3);
    if (next === 5 && !selectedSlot) return setStep(4);
    setStep(next);
  };

  const confirmBooking = async () => {
    if (!supabase || !selectedSlot || !selectedDogId || bookingCompleted || submitting) return;
    setSubmitting(true);
    setMessage(null);
    setSuccessSummary(null);
    try {
      const args = {
        p_station_id: selectedSlot.stationId,
        p_dog_id: selectedDogId,
        p_start_time: selectedSlot.start.toISOString(),
        p_end_time: selectedSlot.end.toISOString()
      } as Database["public"]["Functions"]["create_booking"]["Args"];

      const { data, error } = await supabase.rpc("create_booking", args);
      if (error) throw error;
      const first = data?.[0];
      setSuccessSummary(
        first
          ? `Prenotazione confermata per ${selectedDog?.name ?? "il tuo cane"} alle ${selectedSlot.label}. Servizi: ${getServiceSummary(selectedServices)}. Costo: ${first.total_credits} crediti.`
          : `Prenotazione confermata per ${selectedDog?.name ?? "il tuo cane"} alle ${selectedSlot.label}.`
      );
      setStep(5);
      setSelectedSlot(null);
      await loadAll();
    } catch (e: any) {
      const msg = String(e?.message ?? "Errore durante la prenotazione.");
      setMessage(msg.includes("Crediti insufficienti") ? "Credito insufficiente. Ricarica il wallet prima di confermare." : msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Prenotazione guidata</h2>
          <p className="text-sm leading-relaxed text-slate-200">
            Per usare la prenotazione reale serve collegare Supabase in <span className="font-medium">.env.local</span>.
          </p>
        </header>
      </div>
    );
  }

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
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">Prenotazione Guidata</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          {"Seleziona il cane, i servizi, la durata ed infine l'orario desiderato."}
        </p>
      </header>

      {message ? (
        <div className="rounded-2xl bg-red-950/20 p-3 text-sm text-red-200 ring-1 ring-inset ring-red-500/20 border border-red-500/10">
          {message}
        </div>
      ) : null}

      {successSummary ? (
        <Card className="backdrop-blur-xl bg-slate-900/40 border border-emerald-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl">
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-500/10 p-2 ring-1 ring-inset ring-emerald-500/30 shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-emerald-200">Prenotazione completata</p>
                <p className="text-xs text-slate-300 leading-relaxed">{successSummary}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-center text-[11px] text-slate-400 leading-relaxed">
                Reindirizzamento automatico alla dashboard tra pochi secondi.
              </p>
              <Link href="/">
                <Button className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500" variant="primary">
                  Vai alla dashboard
                </Button>
              </Link>
              <Button
                className="w-full rounded-2xl"
                variant="secondary"
                onClick={() => {
                  setSuccessSummary(null);
                  setSelectedSlot(null);
                  setStep(4);
                }}
              >
                Prenota un altro orario
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl overflow-hidden">
          {/* Card Header with unified Step Indicator */}
          <CardHeader className="space-y-3 pb-3 border-b border-slate-800/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm font-bold tracking-tight text-slate-200">Completa Prenotazione</span>
              </div>
              {step > 1 && (
                <Button
                  variant="ghost"
                  size="md"
                  className="h-8 text-xs text-slate-400 hover:text-slate-200 rounded-xl px-2.5 bg-slate-900/30 border border-slate-800/60"
                  onClick={() => goToStep((step - 1) as Step)}
                >
                  <ChevronLeft className="h-4 w-4 mr-0.5" /> Indietro
                </Button>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {stepItems.map((item) => {
                const active = step === item.value;
                const done = step > item.value || (item.value === 1 && !!selectedDogId) || (item.value === 5 && !!selectedSlot);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => goToStep(item.value)}
                    disabled={bookingCompleted}
                    className={cn(
                      "rounded-xl py-2 text-center text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset transition-all duration-200 cursor-pointer disabled:opacity-50",
                      active
                        ? "bg-blue-500/15 text-blue-200 ring-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
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

          {/* Card Content with Step Switch Animations */}
          <CardContent className="pt-4 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 1 di 5</p>
                    <p className="text-lg font-bold text-slate-100">Quale cane vuoi portare?</p>
                  </div>

                  {dogs.length ? (
                    <div className="grid gap-2.5">
                      {dogs.map((dog) => {
                        const selected = dog.id === selectedDogId;
                        return (
                          <motion.button
                            key={dog.id}
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedDogId(dog.id);
                              setManualDuration(false);
                              setStep(2);
                            }}
                            className={cn(
                              "rounded-2xl p-3 text-left ring-1 ring-inset transition-all duration-200 cursor-pointer flex w-full items-center gap-3.5",
                              selected
                                ? "bg-blue-500/10 ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                                : "bg-slate-950/40 ring-slate-800/80 hover:bg-slate-900/40"
                            )}
                          >
                            <div className={cn(
                              "rounded-xl p-2.5 ring-1 ring-inset transition-colors shrink-0",
                              selected ? "bg-blue-500/20 ring-blue-400/30" : "bg-slate-900 ring-slate-850"
                            )}>
                              <PawPrint className={cn("h-4 w-4", selected ? "text-blue-200" : "text-slate-300")} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-100">{dog.name}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                                {[dog.breed, dog.size, dog.weight ? `${dog.weight} kg` : null].filter(Boolean).join(" · ") || "Profilo salvato"}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-inset ring-slate-800/80">
                      <p className="text-sm font-bold text-slate-100">Prima aggiungi il tuo cane</p>
                      <p className="text-xs text-slate-400 leading-relaxed">Per suggerirti il tempo corretto dobbiamo conoscere almeno taglia e peso.</p>
                      <Button className="w-full rounded-2xl" variant="primary" onClick={() => router.push("/cani/nuovo")}>
                        <PawPrint className="h-4 w-4 mr-1" />
                        Aggiungi cane
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 2 di 5</p>
                    <p className="text-lg font-bold text-slate-100">Quali servizi vuoi fare?</p>
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
                            "rounded-2xl p-3 text-left ring-1 ring-inset transition-all duration-200 cursor-pointer flex w-full items-start gap-3.5",
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
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pacchetto scelto</p>
                    <p className="text-sm font-bold text-slate-200">{getServiceSummary(selectedServices)}</p>
                    <p className="text-[11px] text-slate-400 pt-0.5 leading-relaxed">
                      Servizio principale per la disponibilità: <span className="font-semibold text-slate-300">{SERVICE_LABELS[primaryService]}</span>
                    </p>
                  </div>

                  <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                    <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500" variant="primary" onClick={() => setStep(3)}>
                      Continua al tempo consigliato
                    </Button>
                  </motion.div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 3 di 5</p>
                    <p className="text-lg font-bold text-slate-100">Quanto tempo consigliamo?</p>
                  </div>

                  <div className="rounded-2xl bg-blue-500/10 p-4 ring-1 ring-inset ring-blue-500/20 space-y-1">
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Tempo suggerito per {selectedDog?.name}</p>
                    <p className="text-3xl font-extrabold tracking-tight text-slate-100">{durationEstimate.suggestedMinutes} minuti</p>
                    <p className="text-xs text-slate-400 pt-0.5 leading-relaxed">
                      Calcolato su {getServiceSummary(selectedServices)}
                      {durationEstimate.weightAdjustment > 0 ? ` con +${durationEstimate.weightAdjustment} minuti per il peso` : " in base a taglia e peso"}.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {durationEstimate.choices.map((choice) => {
                      const selected = durationMinutes === choice;
                      return (
                        <motion.button
                          key={choice}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setDurationMinutes(choice);
                            setManualDuration(true);
                          }}
                          className={cn(
                            "rounded-2xl px-3 py-3 text-center ring-1 ring-inset transition-all duration-200 cursor-pointer",
                            selected
                              ? "bg-blue-500/10 ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                              : "bg-slate-950/40 ring-slate-800/85 hover:bg-slate-900/40"
                          )}
                        >
                          <p className="text-sm font-bold text-slate-100">{choice} min</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{choice === durationEstimate.suggestedMinutes ? "Consigliato" : "Alternativa"}</p>
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="pt-2 grid gap-2">
                    <Button className="w-full rounded-2xl" variant="secondary" onClick={() => { setDurationMinutes(durationEstimate.suggestedMinutes); setManualDuration(false); }}>
                      Usa il tempo consigliato
                    </Button>
                    <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500" variant="primary" onClick={() => setStep(4)}>
                      Continua con giorno e orario
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 4 di 5</p>
                      <p className="text-lg font-bold text-slate-100">Scegli giorno e orario</p>
                    </div>
                    <Button type="button" variant="ghost" size="md" className="h-8 w-8 p-0 rounded-xl hover:bg-slate-800/50" onClick={() => void loadAll()} disabled={loading} aria-label="Aggiorna">
                      <RefreshCw className={cn("h-4 w-4 text-slate-300", loading && "animate-spin")} />
                    </Button>
                  </div>

                  <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-slate-300">Data della sessione</p>
                      <p className="text-xs text-slate-400 font-semibold">{selectedDayLabel}</p>
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
                          if (key < calendarStartKey || key > calendarEndKey) return;
                          setDay(startOfLocalDay(new Date(`${key}T00:00:00`)));
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
                          if (key < calendarStartKey || key > calendarEndKey) return;
                          setDay(startOfLocalDay(new Date(`${key}T00:00:00`)));
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
                          if (key < calendarStartKey || key > calendarEndKey) return;
                          setDay(startOfLocalDay(new Date(`${key}T00:00:00`)));
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
                              const isSelected = cellKey === ymd(day);
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
                          {selectedDayLabel} · {suggestedSlots.length} {suggestedSlots.length === 1 ? "orario" : "orari"}
                        </p>
                      </div>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                        suggestedSlots.length
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                          : "bg-rose-500/10 text-rose-300 ring-rose-500/20"
                      )}>
                        {suggestedSlots.length ? "Libero" : "Pieno"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-900/10">
                      {suggestedSlots.length ? (
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
                            {suggestedSlots.map((slot) => {
                              const selected = selectedSlot?.key === slot.key;
                              return (
                                <button
                                  key={slot.key}
                                  type="button"
                                  onClick={() => setSelectedSlot(slot)}
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
                          <p className="mt-0.5 text-xs text-slate-400">Prova un altro giorno o cambia la durata.</p>
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
                          {selectedDayLabel} · {selectedSlot?.label ?? "Seleziona un orario"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                    <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10" variant="primary" onClick={() => setStep(5)} disabled={!selectedSlot}>
                      Continua alla conferma
                    </Button>
                  </motion.div>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="space-y-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step 5 di 5</p>
                    <p className="text-lg font-bold text-slate-100">Controlla e conferma</p>
                  </div>

                  <div className="grid gap-2.5">
                    <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 flex items-center gap-3">
                      <PawPrint className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cane</p>
                        <p className="text-sm font-bold text-slate-200">{selectedDog?.name}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 flex items-center gap-3">
                      <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Servizi</p>
                        <p className="text-sm font-bold text-slate-200">{getServiceSummary(selectedServices)}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 flex items-center gap-3">
                      <Clock3 className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Durata e orario</p>
                        <p className="text-sm font-bold text-slate-200">{durationMinutes} min · {selectedSlot?.label}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Giorno</p>
                        <p className="text-sm font-bold text-slate-200">{selectedDayLabel}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/40 p-3 ring-1 ring-inset ring-slate-800/80 flex items-center gap-3">
                      <CreditCard className="h-4 w-4 text-blue-400 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Postazione assegnata</p>
                        <p className="text-sm font-bold text-slate-200">{selectedSlot?.stationName ?? "Automatica"}</p>
                      </div>
                    </div>
                  </div>

                  <motion.div whileTap={{ scale: 0.98 }} className="pt-2">
                    <Button className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10 cursor-pointer" variant="primary" onClick={() => void confirmBooking()} disabled={!selectedSlot || !selectedDogId || submitting}>
                      {submitting ? "Conferma in corso..." : "Conferma prenotazione"}
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
