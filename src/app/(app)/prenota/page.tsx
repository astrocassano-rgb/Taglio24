"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CalendarDays, 
  CheckCircle2, 
  Clock3, 
  Droplets, 
  Lock, 
  PawPrint, 
  RefreshCw, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  CreditCard, 
  Plus, 
  AlertCircle, 
  X,
  Check,
  type LucideIcon 
} from "lucide-react";
import { 
  estimateDurationForBundle, 
  getPrimaryService, 
  getServiceSummary, 
  normalizeServiceBundle, 
  parseServiceBundle,
  serializeServiceBundle, 
  SERVICE_LABELS, 
  type StationType 
} from "@/lib/booking-planner";
import { tryCreateSupabaseBrowserClient } from "@/lib/supabase/optional";
import { safeGetSession } from "@/lib/supabase/safe-session";
import type { Database } from "@/types/database";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";
import { sendBookingConfirmationWhatsApp } from "./actions";

type Station = Database["public"]["Tables"]["stations"]["Row"];
type AvailabilityRow = Database["public"]["Functions"]["get_booking_availability"]["Returns"][number];
type Dog = Database["public"]["Tables"]["dogs"]["Row"];

type CustomSlot = {
  time: string;
  start: Date;
  end: Date;
  stationId: string;
  stationName: string;
  isPast: boolean;
  isAvailable: boolean;
  freeStationsCount: number;
};

const slotMinutes = 15;
const dayHours = { start: 0, end: 24 };
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

export default function PrenotaPage() {
  const router = useRouter();
  const supabase = useMemo(() => tryCreateSupabaseBrowserClient(), []);
  const isConfigured = Boolean(supabase);

  const calendarStart = useMemo(() => startOfLocalDay(new Date()), []);
  const calendar = useMemo(() => Array.from({ length: calendarDays }, (_, i) => addDays(calendarStart, i)), [calendarStart]);

  // Stati generali
  const [stations, setStations] = useState<Station[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityHint, setAvailabilityHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isTimeSlotsModalOpen, setIsTimeSlotsModalOpen] = useState(false);
  
  // Dati utente
  const [isLogged, setIsLogged] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState("");
  const [balanceCredits, setBalanceCredits] = useState<number | null>(null);

  // Selezione della prenotazione
  const [selectedServices, setSelectedServices] = useState<StationType[]>(["WASH_BASIN"]);
  const [selectedFascia, setSelectedFascia] = useState<"night" | "morning" | "afternoon" | "evening">("morning");
  const [previewDayKey, setPreviewDayKey] = useState("");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), 1));
  const [initialTimeFromUrl, setInitialTimeFromUrl] = useState<string | null>(null);

  // Stato modale di conferma
  const [confirmSlot, setConfirmSlot] = useState<CustomSlot | null>(null);
  const [settings, setSettings] = useState<Database["public"]["Tables"]["system_settings"]["Row"] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<string | null>(null);

  type Service = Database["public"]["Tables"]["services"]["Row"];
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [paramsRestored, setParamsRestored] = useState(false);
  const [isFirstServiceSync, setIsFirstServiceSync] = useState(true);

  const serviceType = selectedService?.booking_type ?? "SELF_SERVICE";

  // Cane selezionato
  const selectedDog = useMemo(() => {
    return dogs.find((d) => d.id === selectedDogId) || null;
  }, [dogs, selectedDogId]);

  // Durata basata sul cane e sui servizi scelti
  const durationEstimate = useMemo(() => {
    return estimateDurationForBundle(selectedServices, selectedDog);
  }, [selectedServices, selectedDog]);
  const durationMinutes = durationEstimate.suggestedMinutes;

  const primaryService = useMemo(() => getPrimaryService(selectedServices), [selectedServices]);

  const availabilityFrom = useMemo(
    () => new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate(), dayHours.start, 0, 0, 0),
    [calendarStart]
  );
  
  const availabilityTo = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return new Date(last.getFullYear(), last.getMonth(), last.getDate(), dayHours.end, 0, 0, 0);
  }, [calendar, calendarStart]);

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

  // Calcolo delle disponibilità per ciascun giorno
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

  const suggestedDayKey = useMemo(() => {
    return weekTimeWindows.find((day) => day.available)?.key ?? weekTimeWindows[0]?.key ?? ymd(calendarStart);
  }, [calendarStart, weekTimeWindows]);

  const fasciaSlots = useMemo(() => {
    const startHour = {
      night: 0,
      morning: 6,
      afternoon: 12,
      evening: 18
    }[selectedFascia];

    return Array.from({ length: 24 }, (_, i) => {
      const totalMinutes = startHour * 60 + i * 15;
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    });
  }, [selectedFascia]);

  const dayKey = previewDayKey || suggestedDayKey;

  // Elaborazione degli slot del giorno corrente con identificazione postazione libera
  const daySlotsInfo = useMemo(() => {
    if (!dayKey || !stationsForService.length) return [];

    const [y, m, d] = dayKey.split("-").map(Number);
    if (!y || !m || !d) return [];

    return fasciaSlots.map((timeLabel) => {
      const [sh, sm] = timeLabel.split(":").map(Number);
      const slotStart = new Date(y, m - 1, d, sh, sm, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
      const isPast = slotStart.getTime() < Date.now();

      let isAvailable = false;
      let freeStationsCount = 0;
      let stationId = "";
      let stationName = "";
      
      if (!isPast) {
        const freeStations = stationsForService.filter((station) => {
          const intervals = availabilityByStation.get(station.id) ?? [];
          return !intervals.some((it) => overlaps(slotStart, slotEnd, it.start, it.end));
        });
        isAvailable = freeStations.length > 0;
        freeStationsCount = freeStations.length;
        if (isAvailable && freeStations[0]) {
          stationId = freeStations[0].id;
          stationName = freeStations[0].name;
        }
      }

      return {
        time: timeLabel,
        start: slotStart,
        end: slotEnd,
        stationId,
        stationName,
        isPast,
        isAvailable,
        freeStationsCount
      } as CustomSlot;
    });
  }, [dayKey, fasciaSlots, durationMinutes, stationsForService, availabilityByStation]);

  const calendarEndKey = useMemo(() => {
    const last = calendar[calendar.length - 1] ?? calendarStart;
    return ymd(last);
  }, [calendar, calendarStart]);

  // 1. Controllo sessione utente
  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const { data } = await safeGetSession(supabase);
      setIsLogged(Boolean(data.session));
      setUserId(data.session?.user?.id ?? null);
    }
    void checkSession();
  }, [supabase]);

  // 2. Caricamento dati utente (cani e wallet)
  useEffect(() => {
    async function loadUserData() {
      if (!supabase || !userId) {
        setDogs([]);
        setBalanceCredits(null);
        return;
      }
      try {
        const [dogsRes, walletRes] = await Promise.all([
          supabase.from("dogs").select("*").order("created_at", { ascending: false }),
          supabase.from("wallets").select("balance_credits").eq("customer_id", userId).maybeSingle()
        ]);
        
        if (dogsRes.data && dogsRes.data.length > 0) {
          setDogs(dogsRes.data);
          setSelectedDogId(dogsRes.data[0]?.id || "");
        } else {
          setDogs([]);
          setSelectedDogId("");
        }
        
        if (walletRes.data) {
          setBalanceCredits(walletRes.data.balance_credits);
        } else {
          setBalanceCredits(0);
        }
      } catch (err) {
        console.error("Errore durante il caricamento dei dati utente:", err);
      }
    }
    void loadUserData();
  }, [supabase, userId]);

  // 3. Ripristino stato da Query Parameters (es. dopo il redirect del login)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const servicesParam = searchParams.get("services");
    const dayParam = searchParams.get("day");
    const timeParam = searchParams.get("time");

    if (servicesParam) {
      const parsed = parseServiceBundle(servicesParam);
      setSelectedServices(parsed);
    }
    
    if (dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
      setPreviewDayKey(dayParam);
      const parsedDay = new Date(`${dayParam}T00:00:00`);
      if (!Number.isNaN(parsedDay.getTime())) {
        setCurrentMonth(new Date(parsedDay.getFullYear(), parsedDay.getMonth(), 1));
      }
    }
    
    if (timeParam && /^\d{2}:\d{2}$/.test(timeParam)) {
      setInitialTimeFromUrl(timeParam);
      const [hour] = timeParam.split(":").map(Number);
      if (hour !== undefined) {
        if (hour < 6) setSelectedFascia("night");
        else if (hour < 12) setSelectedFascia("morning");
        else if (hour < 18) setSelectedFascia("afternoon");
        else setSelectedFascia("evening");
      }
    }
    setParamsRestored(true);
  }, []);

  // Sincronizza i servizi fisici selezionati quando cambia il servizio dinamico
  useEffect(() => {
    if (selectedService && paramsRestored) {
      if (isFirstServiceSync) {
        setIsFirstServiceSync(false);
        // Salta la sovrascrittura automatica al primo avvio se l'URL contiene già un parametro services
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("services")) {
          return;
        }
      }
      setSelectedServices([selectedService.station_type]);
    }
  }, [selectedService, paramsRestored, isFirstServiceSync]);

  // 4. Se è presente un orario iniziale dall'URL ed i dati sono stati caricati, apriamo la modale di conferma
  useEffect(() => {
    if (initialTimeFromUrl && daySlotsInfo.length > 0 && isLogged && dogs.length > 0) {
      const matchedSlot = daySlotsInfo.find((s) => s.time === initialTimeFromUrl && s.isAvailable);
      if (matchedSlot) {
        setConfirmSlot(matchedSlot);
        setBookingMessage(null);
        setSuccessSummary(null);
        setInitialTimeFromUrl(null); // Consumiamo il parametro
      }
    }
  }, [initialTimeFromUrl, daySlotsInfo, isLogged, dogs]);

  // 5. Caricamento disponibilità generali (stazioni + calendario occupazioni)
  const loadAvailability = async () => {
    if (!supabase) return;
    setLoading(true);
    setAvailabilityHint(null);
    try {
      // 1. Rileva il sottodominio dal client
      let subdomain = "";
      if (typeof window !== "undefined") {
        const host = window.location.host; // pawspa.dogwash24.it, pawspa.localhost:3000
        const domainParts = host.split(".");
        if (host.includes("localhost") || host.includes("127.0.0.1")) {
          const parts = host.split(":");
          const part0 = parts[0];
          if (part0) {
            const localParts = part0.split(".");
            if (localParts.length > 1) {
              subdomain = localParts[0] || "";
            }
          }
        } else {
          if (domainParts.length >= 3) {
            const sub = domainParts[0] || "";
            if (sub !== "www" && sub !== "app") {
              subdomain = sub;
            }
          }
        }
      }

      // 2. Trova il tenant
      let tenantId = "00000000-0000-0000-0000-000000000000";
      if (subdomain) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id")
          .eq("slug", subdomain)
          .maybeSingle();
        if (tenant) {
          tenantId = tenant.id;
        }
      }

      // 3. Carica le postazioni filtrate per tenant
      const { data: stationsData, error: stationsError } = await supabase
        .from("stations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      if (stationsError) throw stationsError;
      setStations(stationsData ?? []);

      // 4. Carica le impostazioni del tenant
      const { data: settingsData, error: settingsError } = await supabase
        .from("system_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!settingsError && settingsData) {
        setSettings(settingsData);
      }

      // 5. Carica i servizi attivi del salone (tenant)
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      
      if (servicesError) throw servicesError;
      
      const loadedServices = servicesData ?? [];
      setServices(loadedServices);

      // Imposta il servizio selezionato di default se non è già impostato o se cambia il salone
      setSelectedService((prev) => {
        // Se c'è un parametro service_id nell'URL, prova a usarlo
        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search);
          const serviceIdParam = searchParams.get("service_id");
          if (serviceIdParam) {
            const found = loadedServices.find(s => s.id === serviceIdParam);
            if (found) return found;
          }
        }

        // Altrimenti mantieni quello già selezionato se è ancora presente nei nuovi
        if (prev && loadedServices.some(s => s.id === prev.id)) {
          return prev;
        }

        // Se il salone è in modalità ASSISTED_ONLY, proviamo a selezionare un servizio di tipo ASSISTED_WASH o FULL_GROOMING
        if (settingsData?.mode === "ASSISTED_ONLY") {
          const assistedService = loadedServices.find(s => s.booking_type === "ASSISTED_WASH");
          if (assistedService) return assistedService;
          const groomingService = loadedServices.find(s => s.booking_type === "FULL_GROOMING");
          if (groomingService) return groomingService;
        }

        // Altrimenti seleziona quello di tipo SELF_SERVICE se presente
        const selfService = loadedServices.find(s => s.booking_type === "SELF_SERVICE");
        if (selfService) return selfService;

        // Fallback: il primo servizio caricato
        return loadedServices[0] || null;
      });

      const args = {
        p_from: availabilityFrom.toISOString(),
        p_to: availabilityTo.toISOString(),
        p_tenant_id: tenantId
      } as Database["public"]["Functions"]["get_booking_availability"]["Args"];
      const { data: availData, error: availError } = await supabase.rpc("get_booking_availability", args);
      if (availError) throw availError;

      // Filtra le occupazioni solo per le postazioni del salone corrente
      const filteredAvail = (availData ?? []).filter((av) =>
        stationsData?.some((st) => st.id === av.station_id)
      );
      setAvailability(filteredAvail);
      setAvailabilityLoaded(true);
    } catch (e: any) {
      setAvailabilityLoaded(false);
      const msg = e?.message ?? "Disponibilità non caricata.";
      const lower = String(msg).toLowerCase();
      setAvailabilityHint(
        msg.includes("get_booking_availability")
          ? "Disponibilità giorni non attiva: esegui la migrazione 0002_booking_availability.sql su Supabase."
          : lower.includes("failed to fetch") || lower.includes("fetch failed") || lower.includes("name not resolved") || lower.includes("dns")
            ? "Connessione a Supabase non riuscita. Controlla URL e chiavi del progetto e riavvia il server."
            : msg
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    void loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityFrom, availabilityTo, supabase]);

  const selectedPreviewDay = useMemo(() => {
    return weekTimeWindows.find((day) => day.key === dayKey) ?? weekTimeWindows[0] ?? null;
  }, [dayKey, weekTimeWindows]);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDay = (key: string) => {
    setPreviewDayKey(key);
    setIsTimeSlotsModalOpen(true);
  };

  const { calendarYear, calendarMonth } = useMemo(() => {
    return {
      calendarYear: currentMonth.getFullYear(),
      calendarMonth: currentMonth.getMonth()
    };
  }, [currentMonth]);

  const monthDays = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const startDay = start.getDay();
    const diffToMonday = start.getDate() - startDay + (startDay === 0 ? -6 : 1);
    const firstMonday = new Date(start.getTime());
    firstMonday.setDate(diffToMonday);
    
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(firstMonday.getTime());
      d.setDate(firstMonday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentMonth]);

  function toggleService(service: StationType) {
    setSelectedServices((current) => {
      if (current.includes(service)) {
        const next = current.filter((item) => item !== service);
        return next.length ? normalizeServiceBundle(next) : current;
      }
      return normalizeServiceBundle([...current, service]);
    });
  }

  // Gestione della prenotazione al click su uno slot
  const handleSlotClick = async (slot: CustomSlot) => {
    if (!isLogged) {
      const params = new URLSearchParams({
        services: serializeServiceBundle(selectedServices),
        day: dayKey,
        time: slot.time
      });
      const redirectUrl = `/prenota?${params.toString()}`;
      router.push(`/login?next=${encodeURIComponent(redirectUrl)}` as Route);
      return;
    }

    // Re-fetcha le disponibilità per avere dati aggiornati prima della conferma
    // (previene overbooking: uno slot potrebbe essere stato preso da un altro utente
    // nel tempo intercorso tra l'apertura della pagina e il click)
    await loadAvailability();

    // Dopo il refresh, ri-verifica che lo slot sia ancora disponibile
    setConfirmSlot(slot);
    setBookingMessage(null);
    setSuccessSummary(null);
  };


  // Costo stimato in crediti (1 credito = 1 minuto basato sulla postazione) + costo operatore fisso
  const estimatedCredits = useMemo(() => {
    if (!confirmSlot) return 0;
    const station = stations.find((s) => s.id === confirmSlot.stationId);
    const costPerMin = station?.cost_per_minute ?? 1;
    const base = durationMinutes * costPerMin;
    
    let operatorCost = 0;
    if (serviceType === "ASSISTED_WASH") {
      operatorCost = settings?.price_assisted_wash_credits ?? 10;
    } else if (serviceType === "FULL_GROOMING") {
      operatorCost = settings?.price_full_grooming_credits ?? 50;
    }
    
    return base + operatorCost;
  }, [confirmSlot, durationMinutes, stations, serviceType, settings]);

  const hasEnoughCredits = useMemo(() => {
    if (balanceCredits === null) return true;
    return balanceCredits >= estimatedCredits;
  }, [balanceCredits, estimatedCredits]);

  // Conferma effettiva tramite API route server-side
  // (workaround per il bug PostgreSQL "column reference total_credits is ambiguous"
  //  nella funzione RPC create_booking — da rimuovere dopo migrazione 0020)
  const handleConfirmBooking = async () => {
    const currentUserId = userId;
    if (!supabase || !confirmSlot || !selectedDogId || !currentUserId || submitting) return;
    setSubmitting(true);
    setBookingMessage(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_station_id: confirmSlot.stationId,
          p_dog_id: selectedDogId,
          p_start_time: confirmSlot.start.toISOString(),
          p_end_time: confirmSlot.end.toISOString(),
          p_service_type: serviceType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Errore durante la prenotazione.");
      }

      const data: Array<{ booking_id: string; total_credits: number; status: string }> = json;
      const first = data?.[0];
      setSuccessSummary(
        first
          ? `Prenotazione confermata per ${selectedDog?.name} alle ${confirmSlot.time}. Costo: ${first.total_credits} crediti.`
          : `Prenotazione confermata per ${selectedDog?.name} alle ${confirmSlot.time}.`
      );
      
      // Carica il nuovo saldo crediti
      const { data: walletData } = await supabase.from("wallets").select("balance_credits").eq("customer_id", currentUserId).maybeSingle();
      if (walletData) {
        setBalanceCredits(walletData.balance_credits);
      }
      
      // Invio notifica WhatsApp in background
      sendBookingConfirmationWhatsApp(currentUserId, {
        stationName: stations.find(s => s.id === confirmSlot.stationId)?.name || "Postazione",
        dogName: selectedDog?.name || "Cane",
        startTime: confirmSlot.start.toISOString(),
        serviceLabel: serviceType === "FULL_GROOMING" ? "Toelettatura Completa" : serviceType === "ASSISTED_WASH" ? "Lavaggio Assistito" : "Self-Service",
      }).catch(e => console.error("Errore notifica whatsapp:", e));
      
      // Ricarica le disponibilità generali
      void loadAvailability();
      
      // Redirect automatico dopo 2.5 secondi alla dashboard
      setTimeout(() => {
        setConfirmSlot(null);
        router.push("/");
      }, 2500);
    } catch (err: any) {
      const msg = String(err?.message ?? "Errore durante la prenotazione.");
      setBookingMessage(msg.includes("Crediti insufficienti") ? "Crediti insufficienti. Ricarica il wallet prima di confermare." : msg);
    } finally {
      setSubmitting(false);
    }
  };


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

  return (
    <div className="space-y-6 pb-10">
      {/* Nasconde scrollbar — CSS puro, nessun dangerouslySetInnerHTML */}
      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* ── Logo ────────────────────────────────────── */}
      <div className="flex justify-center">
        <Link href="/" aria-label="Torna alla Home">
          <div className="mx-auto w-44 max-w-full">
            <Image
              src="/logo.png"
              alt="DogWash24 - Self Service Toilettatura"
              width={440}
              height={440}
              priority
              className="h-auto w-full"
            />
          </div>
        </Link>
      </div>

      <header className="space-y-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
          Disponibilità H24
        </h2>
        <p className="text-sm leading-relaxed text-slate-400">
          {isLogged
            ? "Seleziona il cane, il servizio, la data ed infine l'orario desiderato per bloccare il tuo slot."
            : "Visualizza gli orari e le disponibilità delle nostre postazioni in tempo reale."}
        </p>
      </header>

      <div className={cn(
        "grid gap-6",
        isLogged ? "grid-cols-1 md:grid-cols-12 md:items-start" : "grid-cols-1"
      )}>
        {isLogged ? (
          <>
            {/* Colonna Configurazione (Sinistra) */}
            <div className="space-y-6 md:col-span-5">
              {/* --- SELEZIONE CANE --- */}
              <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-400">1. Il tuo cane</p>
                    <p className="text-sm font-semibold text-slate-200">Per chi è la prenotazione?</p>
                  </div>
                  <Link href="/cani/nuovo">
                    <Button size="md" variant="ghost" className="h-8 rounded-xl bg-slate-950/40 border border-slate-800 hover:bg-slate-800/50 text-xs text-slate-300 gap-1 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Aggiungi
                    </Button>
                  </Link>
                </div>

                {dogs.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {dogs.map((dog) => {
                      const active = dog.id === selectedDogId;
                      return (
                        <button
                          key={dog.id}
                          type="button"
                          onClick={() => setSelectedDogId(dog.id)}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-left shrink-0 transition-all duration-200 cursor-pointer",
                            active
                              ? "bg-blue-500/10 border-blue-500/40 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                              : "bg-slate-950/40 border-slate-800/60 text-slate-450 hover:bg-slate-900/40 hover:text-slate-200"
                          )}
                        >
                          <PawPrint className={cn("h-4 w-4", active ? "text-blue-300 animate-pulse" : "text-slate-400")} />
                          <div className="text-xs font-bold text-left">
                            <p>{dog.name}</p>
                            <p className="text-[9px] opacity-60 font-medium font-mono lowercase">
                              {dog.size || "media"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-2xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-400">
                    Nessun cane registrato. <Link href="/cani/nuovo" className="text-blue-400 font-semibold underline">Aggiungine uno ora</Link> per iniziare.
                  </div>
                )}
              </Card>

              {/* --- STEP 2: MODALITÀ DI LAVAGGIO (Servizio Dinamico) --- */}
              <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl p-4 space-y-3">
                <div className="space-y-0.5 text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-400">2. Servizio</p>
                  <p className="text-sm font-semibold text-slate-200">Scegli il servizio per il tuo cane</p>
                </div>

                <div className="grid gap-3">
                  {services.map((srv) => {
                    const active = selectedService?.id === srv.id;
                    const Icon = srv.booking_type === "FULL_GROOMING" 
                      ? Sparkles 
                      : srv.booking_type === "ASSISTED_WASH" 
                      ? Droplets 
                      : PawPrint;
                    
                    const fixed = Number(srv.fixed_cost_credits);
                    const perMin = Number(srv.cost_per_minute_credits);
                    
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => setSelectedService(srv)}
                        className={cn(
                          "rounded-2xl p-4 text-left ring-1 ring-inset transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[110px]",
                          active
                            ? srv.booking_type === "FULL_GROOMING"
                              ? "bg-fuchsia-500/10 ring-fuchsia-500/30 shadow-[0_0_12px_rgba(217,70,239,0.08)]"
                              : srv.booking_type === "ASSISTED_WASH"
                              ? "bg-blue-500/10 ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                              : "bg-cyan-500/10 ring-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.08)]"
                            : "bg-slate-950/40 ring-slate-800/80 hover:bg-slate-900/40"
                        )}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div className={cn(
                            "rounded-xl p-2 ring-1 ring-inset transition-colors shrink-0",
                            active
                              ? srv.booking_type === "FULL_GROOMING"
                                ? "bg-fuchsia-500/20 ring-fuchsia-400/30 text-fuchsia-200"
                                : srv.booking_type === "ASSISTED_WASH"
                                ? "bg-blue-500/20 ring-blue-400/30 text-blue-200"
                                : "bg-cyan-500/20 ring-cyan-400/30 text-cyan-200"
                              : "bg-slate-900 ring-slate-850 text-slate-400"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {fixed > 0 && (
                              <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[8px] font-bold ring-1 ring-inset",
                                active
                                  ? srv.booking_type === "FULL_GROOMING"
                                    ? "bg-fuchsia-500/20 text-fuchsia-350 ring-fuchsia-500/30"
                                    : srv.booking_type === "ASSISTED_WASH"
                                    ? "bg-blue-500/20 text-blue-350 ring-blue-500/30"
                                    : "bg-cyan-500/20 text-cyan-350 ring-cyan-500/30"
                                  : "bg-slate-950 text-slate-405 ring-slate-800"
                              )}>
                                +{fixed} cr quota fissa
                              </span>
                            )}
                            {perMin > 0 && (
                              <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[8px] font-bold ring-1 ring-inset",
                                active
                                  ? srv.booking_type === "FULL_GROOMING"
                                    ? "bg-fuchsia-500/20 text-fuchsia-350 ring-fuchsia-500/30"
                                    : srv.booking_type === "ASSISTED_WASH"
                                    ? "bg-blue-500/20 text-blue-350 ring-blue-500/30"
                                    : "bg-cyan-500/20 text-cyan-350 ring-cyan-500/30"
                                  : "bg-slate-950 text-slate-405 ring-slate-800"
                              )}>
                                {perMin} cr/min
                              </span>
                            )}
                            <div className={cn(
                              "h-4 w-4 rounded-full border flex items-center justify-center transition-all",
                              active
                                ? srv.booking_type === "FULL_GROOMING"
                                  ? "bg-fuchsia-500 border-fuchsia-400"
                                  : srv.booking_type === "ASSISTED_WASH"
                                  ? "bg-blue-500 border-blue-400"
                                  : "bg-cyan-500 border-cyan-400"
                                : "border-slate-700 bg-slate-950"
                            )}>
                              {active && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-3 text-left w-full">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-100">{srv.name}</p>
                            <span className={cn(
                              "text-[8px] uppercase font-bold tracking-wider opacity-85",
                              srv.booking_type === "FULL_GROOMING" ? "text-fuchsia-400" : srv.booking_type === "ASSISTED_WASH" ? "text-blue-400" : "text-cyan-400"
                            )}>
                              {srv.booking_type === "FULL_GROOMING" ? "Toelettatura" : srv.booking_type === "ASSISTED_WASH" ? "Assistito" : "Self"}
                            </span>
                          </div>
                          {srv.description && (
                            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                              {srv.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {services.length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Nessun servizio disponibile.
                    </div>
                  )}
                </div>
              </Card>

              {/* --- STEP 3: SELEZIONE SERVIZI --- */}
              <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-400">3. Servizi</p>
                    <p className="text-sm font-semibold text-slate-200">Scegli i trattamenti</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="md"
                    className="h-9 w-9 p-0 rounded-xl hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => void loadAvailability()}
                    disabled={loading}
                    aria-label="Aggiorna disponibilità"
                  >
                    <RefreshCw className={cn("h-4 w-4 text-slate-300", loading && "animate-spin")} />
                  </Button>
                </div>

                <div className="grid gap-2">
                  {serviceOptions.map(({ value, label, subtitle, Icon }) => {
                    const selected = selectedServices.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleService(value)}
                        className={cn(
                          "rounded-2xl p-3 text-left ring-1 ring-inset transition-all duration-200 cursor-pointer flex w-full items-center gap-3",
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
                                Attivo
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-1">{subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl bg-slate-950/50 p-3 ring-1 ring-inset ring-slate-800/80 text-xs text-slate-400 space-y-1 text-left">
                  <p className="font-semibold text-slate-300">Tempo stimato per i servizi scelti:</p>
                  <p className="text-slate-300">
                    <span className="text-blue-400 font-bold">{durationMinutes} minuti</span> ({getServiceSummary(selectedServices)})
                  </p>
                </div>
              </Card>
            </div>

            {/* Colonna Calendario (Destra) */}
            <div className="md:col-span-7">
              {/* --- STEP 4: SELEZIONE CALENDARIO --- */}
              <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-400">4. Data Prenotazione</p>
                  <p className="text-xs text-slate-400 font-semibold">{selectedPreviewDay?.label ?? "—"}</p>
                </div>

                <div className="rounded-2xl bg-slate-950/60 p-3 border border-slate-800/80 space-y-3">
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

                  <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {WEEKDAYS.map((dayName) => (
                      <div key={dayName}>{dayName}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {monthDays.map((day, idx) => {
                      const cellKey = ymd(day);
                      const isCurrentMonth = day.getMonth() === currentMonth.getMonth() && day.getFullYear() === currentMonth.getFullYear();
                      const isBeforeStart = cellKey < ymd(calendarStart);
                      const isAfterEnd = cellKey > calendarEndKey;
                      const isAvailable = availableDaysSet.has(cellKey);
                      const isDisabled = isBeforeStart || isAfterEnd || !isAvailable;
                      const isSelected = cellKey === dayKey;
                      const isToday = cellKey === ymd(new Date());

                      const dayWindow = weekTimeWindows.find((w) => w.key === cellKey);
                      const availableSlotsCount = dayWindow?.ranges.length ?? 0;

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => handleSelectDay(cellKey)}
                          className={cn(
                            "aspect-square w-full text-xs rounded-2xl flex flex-col items-center justify-between p-1.5 transition-all relative cursor-pointer border",
                            isSelected
                              ? "bg-blue-600/20 border-blue-500 text-slate-50 font-bold shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-105"
                              : isToday && !isDisabled
                              ? "bg-slate-900 border-cyan-500/40 text-cyan-400 font-bold hover:bg-slate-850"
                              : !isDisabled
                              ? cn(
                                  "bg-slate-950/40 border-slate-800/80 text-slate-200 hover:bg-slate-900 hover:border-slate-700",
                                  !isCurrentMonth && "opacity-30"
                                )
                              : cn(
                                  "bg-slate-950/10 border-slate-900/40 text-slate-700 pointer-events-none",
                                  isCurrentMonth ? "opacity-20" : "opacity-5"
                                )
                          )}
                        >
                          <span className="text-[11px] font-black">{day.getDate()}</span>
                          {availableSlotsCount > 0 && !isDisabled && (
                            <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 scale-90 tracking-tighter max-w-full truncate">
                              {availableSlotsCount} liberi
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          </>
        ) : (
          /* Utente non loggato: Calendario Disponibilità centrato */
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {/* --- INSERISCI LOGIN SE NON LOGGATO --- */}
            <Card className="backdrop-blur-xl bg-slate-900/20 border border-blue-500/10 rounded-3xl p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-[75%] text-left">
                <p className="text-xs font-semibold text-blue-400">Non sei autenticato</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Puoi guardare gli orari liberi, ma per prenotare devi prima accedere al tuo account.
                </p>
              </div>
              <Link href="/login?next=/prenota" className="shrink-0">
                <Button size="md" variant="primary" className="rounded-xl bg-blue-600 hover:bg-blue-500 text-xs px-4">
                  Accedi
                </Button>
              </Link>
            </Card>

            {/* --- CALENDARIO DISPONIBILITÀ --- */}
            <Card className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Data Disponibilità</p>
                <p className="text-xs text-slate-400 font-semibold">{selectedPreviewDay?.label ?? "—"}</p>
              </div>

              <div className="rounded-2xl bg-slate-950/60 p-3 border border-slate-800/80 space-y-3">
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

                <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  {WEEKDAYS.map((dayName) => (
                    <div key={dayName}>{dayName}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {monthDays.map((day, idx) => {
                    const cellKey = ymd(day);
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth() && day.getFullYear() === currentMonth.getFullYear();
                    const isBeforeStart = cellKey < ymd(calendarStart);
                    const isAfterEnd = cellKey > calendarEndKey;
                    const isAvailable = availableDaysSet.has(cellKey);
                    const isDisabled = isBeforeStart || isAfterEnd || !isAvailable;
                    const isSelected = cellKey === dayKey;
                    const isToday = cellKey === ymd(new Date());

                    const dayWindow = weekTimeWindows.find((w) => w.key === cellKey);
                    const availableSlotsCount = dayWindow?.ranges.length ?? 0;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelectDay(cellKey)}
                        className={cn(
                          "aspect-square w-full text-xs rounded-2xl flex flex-col items-center justify-between p-1.5 transition-all relative cursor-pointer border",
                          isSelected
                            ? "bg-blue-600/20 border-blue-500 text-slate-50 font-bold shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-105"
                            : isToday && !isDisabled
                            ? "bg-slate-900 border-cyan-500/40 text-cyan-400 font-bold hover:bg-slate-850"
                            : !isDisabled
                            ? cn(
                                "bg-slate-950/40 border-slate-800/80 text-slate-200 hover:bg-slate-900 hover:border-slate-700",
                                !isCurrentMonth && "opacity-30"
                              )
                            : cn(
                                "bg-slate-950/10 border-slate-900/40 text-slate-700 pointer-events-none",
                                isCurrentMonth ? "opacity-20" : "opacity-5"
                              )
                        )}
                      >
                        <span className="text-[11px] font-black">{day.getDate()}</span>
                        {availableSlotsCount > 0 && !isDisabled && (
                          <span className="text-[8px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 scale-90 tracking-tighter max-w-full truncate">
                            {availableSlotsCount} liberi
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* --- MODALE SELEZIONE ORARI (Framer Motion) --- */}
      <AnimatePresence>
        {isTimeSlotsModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            {/* Overlay Sfondo con Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setIsTimeSlotsModalOpen(false)}
            />

            {/* Box della Modale */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="relative w-full max-w-sm rounded-3xl bg-slate-900/90 border border-slate-800/80 p-5 shadow-2xl backdrop-blur-2xl z-10 space-y-4 max-h-[85vh] overflow-y-auto scrollbar-none"
            >
              {/* Tasto Chiudi */}
              <button
                type="button"
                onClick={() => setIsTimeSlotsModalOpen(false)}
                className="absolute top-4 right-4 rounded-xl p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="space-y-1 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Orari del giorno</p>
                <h3 className="text-sm font-bold text-slate-100 capitalize">
                  {selectedPreviewDay?.label ?? "Seleziona orario"}
                </h3>
              </div>

              {/* Fasce orarie tabs */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
                {[
                  { key: "night", label: "Notte", desc: "00-06" },
                  { key: "morning", label: "Mattina", desc: "06-12" },
                  { key: "afternoon", label: "Pome", desc: "12-18" },
                  { key: "evening", label: "Sera", desc: "18-24" }
                ].map((fascia) => {
                  const active = selectedFascia === fascia.key;
                  return (
                    <button
                      key={fascia.key}
                      type="button"
                      onClick={() => setSelectedFascia(fascia.key as any)}
                      className={cn(
                        "py-1.5 rounded-xl text-center flex flex-col items-center justify-center cursor-pointer transition-all duration-200",
                        active
                          ? "bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.1)]"
                          : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <span className="text-[11px] font-bold">{fascia.label}</span>
                      <span className="text-[8px] opacity-70 mt-0.5">{fascia.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Griglia slot */}
              <div className="pt-1">
                {daySlotsInfo.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {daySlotsInfo.map((slot) => {
                      if (slot.isAvailable) {
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            onClick={() => {
                              setIsTimeSlotsModalOpen(false);
                              handleSlotClick(slot);
                            }}
                            className="group block rounded-2xl p-2.5 text-center transition-all duration-200 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 ring-1 ring-inset ring-blue-500/20 hover:ring-blue-500/40 hover:from-blue-500/15 hover:to-cyan-500/10 cursor-pointer shadow-[0_4px_12px_rgba(59,130,246,0.05)] active:scale-98 text-left w-full"
                          >
                            <p className="text-xs font-bold text-slate-100 group-hover:text-blue-200 transition-colors text-center">
                              {slot.time}
                            </p>
                            <p className="text-[9px] font-semibold text-emerald-400 mt-0.5 text-center">
                              Libero
                            </p>
                            <div className="mt-1.5 text-[8px] font-bold text-slate-100 uppercase tracking-wider bg-blue-600/30 rounded-lg py-0.5 px-2 ring-1 ring-inset ring-blue-400/30 text-center">
                              Prenota
                            </div>
                          </button>
                        );
                      } else {
                        return (
                          <div
                            key={slot.time}
                            className="rounded-2xl p-2.5 text-center bg-slate-950/40 ring-1 ring-inset ring-slate-900/60 opacity-40 select-none flex flex-col justify-between h-full min-h-[70px]"
                          >
                            <p className="text-xs font-bold text-slate-500 line-through">
                              {slot.time}
                            </p>
                            <p className="text-[9px] font-semibold text-slate-400 mt-0.5">
                              {slot.isPast ? "Passato" : "Occupato"}
                            </p>
                          </div>
                        );
                      }
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    Caricamento slot orari...
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- GESTIONE DEI MESSAGGI GENERALI DI ERRORE --- */}
      {availabilityHint && (
        <div className="rounded-2xl bg-red-950/20 p-3 text-xs text-red-200 border border-red-500/20">
          {availabilityHint}
        </div>
      )}

      {/* --- MODALE DI CONFERMA APPLE-STYLE (Framer Motion) --- */}
      <AnimatePresence>
        {confirmSlot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay Sfondo con Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => !submitting && !successSummary && setConfirmSlot(null)}
            />

            {/* Box della Modale */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="relative w-full max-w-sm rounded-3xl bg-slate-900/90 border border-slate-800/80 p-6 shadow-2xl backdrop-blur-2xl z-10 space-y-5"
            >
              {/* Tasto Chiudi */}
              {!submitting && !successSummary && (
                <button
                  type="button"
                  onClick={() => setConfirmSlot(null)}
                  className="absolute top-4 right-4 rounded-xl p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              )}

              {/* STATO SUCCESSO */}
              {successSummary ? (
                <div className="text-center py-4 space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-100">Prenotazione Confermata!</h3>
                    <p className="text-xs text-slate-450 leading-relaxed">
                      {successSummary}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500 pt-2 animate-pulse">
                    Reindirizzamento alla dashboard tra pochi secondi...
                  </p>
                </div>
              ) : (
                <>
                  {/* STATO CONFERMA STANDARD */}
                  <div className="space-y-1 text-center">
                    <h3 className="text-lg font-bold text-slate-100">Conferma la sessione</h3>
                    <p className="text-xs text-slate-400">Verifica i dettagli prima di prenotare lo slot.</p>
                  </div>

                  {bookingMessage && (
                    <div className="rounded-xl bg-red-950/20 p-3 text-xs text-red-200 border border-red-500/20 flex gap-2 text-left">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
                      <span>{bookingMessage}</span>
                    </div>
                  )}

                  <div className="space-y-2 bg-slate-950/40 p-4 rounded-2xl border border-slate-900 shadow-inner text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Cane</span>
                      <span className="font-bold text-slate-200">{selectedDog?.name || "Nessuno"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Servizi</span>
                      <span className="font-bold text-slate-200 max-w-[65%] text-right truncate">
                        {getServiceSummary(selectedServices)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Data</span>
                      <span className="font-bold text-slate-200">
                        {confirmSlot.start.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long" })}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Ora e Durata</span>
                      <span className="font-bold text-slate-200">
                        {confirmSlot.time} ({durationMinutes} min)
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-400">Postazione</span>
                      <span className="font-bold text-slate-200">{confirmSlot.stationName}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Servizio Scelto</span>
                      <span className={cn("font-bold", serviceType === "FULL_GROOMING" ? "text-fuchsia-400" : serviceType === "ASSISTED_WASH" ? "text-blue-400" : "text-cyan-400")}>
                        {selectedService?.name || "Servizio"}
                      </span>
                    </div>
                  </div>

                  {/* INFO CREDITI */}
                  <div className="rounded-2xl p-4 bg-slate-950/20 border border-slate-800 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Costo Stimato</p>
                      <p className="text-lg font-extrabold text-blue-400">{estimatedCredits} crediti</p>
                    </div>
                    {balanceCredits !== null && (
                      <div className="text-right space-y-0.5">
                        <p className="text-[10px] text-slate-400">Saldo attuale: {balanceCredits} cr</p>
                        {hasEnoughCredits ? (
                          <p className="text-[10px] text-emerald-450 font-medium">Saldo rimanente: {(balanceCredits - estimatedCredits).toFixed(1)} cr</p>
                        ) : (
                          <p className="text-[10px] text-rose-455 font-bold flex items-center justify-end gap-0.5">
                            <Lock className="h-3 w-3" /> Credito insufficiente
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AZIONI */}
                  <div className="space-y-2 pt-2">
                    {hasEnoughCredits ? (
                      <Button
                        type="button"
                        onClick={handleConfirmBooking}
                        disabled={submitting || !selectedDogId}
                        className="w-full rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 cursor-pointer shadow-lg shadow-blue-900/20"
                        variant="primary"
                      >
                        {submitting ? "Prenotazione in corso..." : "Conferma Prenotazione"}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <Link href="/wallet" className="block w-full">
                          <Button
                            type="button"
                            className="w-full rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 cursor-pointer shadow-lg shadow-amber-900/20"
                            variant="primary"
                          >
                            Ricarica Wallet
                          </Button>
                        </Link>
                        <p className="text-center text-[10px] text-slate-400 leading-relaxed">
                          Ricarica il tuo conto crediti per completare questa prenotazione.
                        </p>
                      </div>
                    )}
                    
                    {!submitting && (
                      <Button
                        type="button"
                        onClick={() => setConfirmSlot(null)}
                        className="w-full rounded-2xl bg-slate-950/40 border border-slate-800 hover:bg-slate-800/30 text-slate-300 font-semibold py-2.5 cursor-pointer"
                        variant="secondary"
                      >
                        Annulla
                      </Button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
