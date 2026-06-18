"use client";

import React, { useMemo, useState, useEffect } from "react";
import { format, parseISO, startOfDay, addMinutes, isSameDay, differenceInMinutes, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { PawPrint, Sparkles, AlertTriangle, Search, Plus, Calendar as CalendarIcon, Clock, User, Scissors, X, Calendar } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { createAdminBooking } from "@/app/(admin)/admin/prenotazioni/actions";
import { useRouter } from "next/navigation";

type Booking = {
  id: string;
  station_id: string;
  start_time: string;
  end_time: string;
  service_type: string;
  status: string;
  customer_id: string;
  dog_id: string;
  total_credits: number;
};

type Station = {
  id: string;
  name: string;
  type: string;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type Dog = {
  id: string;
  name: string;
  customer_id: string;
};

interface SmartAgendaProps {
  bookings: Booking[];
  stations: Station[];
  dogNames: Record<string, string>;
  customerNames: Record<string, string>;
  allDogs: Dog[];
  allProfiles: Profile[];
  maxConcurrentAssisted: number;
  selectedDateStr: string;
}

const SLOT_MINUTES = 30;

export function SmartAgenda({
  bookings,
  stations,
  dogNames,
  customerNames,
  allDogs,
  allProfiles,
  maxConcurrentAssisted,
  selectedDateStr,
}: SmartAgendaProps) {
  const router = useRouter();
  
  // Normalize the selected date
  const selectedDate = useMemo(() => {
    if (!selectedDateStr) return new Date();
    // handles ISO or YYYY-MM-DD
    return parseISO(selectedDateStr.includes("T") ? selectedDateStr : `${selectedDateStr}T12:00:00`);
  }, [selectedDateStr]);

  const [selectedSlot, setSelectedSlot] = useState<{ stationId: string; time: Date } | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  // Modal form states
  const [modalDate, setModalDate] = useState<string>("");
  const [modalTime, setModalTime] = useState<string>("");
  const [modalDuration, setModalDuration] = useState<number>(30);

  // Initialize modal states when a slot is clicked
  useEffect(() => {
    if (selectedSlot) {
      setModalDate(format(selectedSlot.time, "yyyy-MM-dd"));
      setModalTime(format(selectedSlot.time, "HH:mm"));
      setModalDuration(30);
    }
  }, [selectedSlot]);

  const customerDogs = useMemo(() => {
    return allDogs.filter(d => d.customer_id === selectedCustomerId);
  }, [allDogs, selectedCustomerId]);

  async function handleCreate(formData: FormData) {
    try {
      setIsPending(true);
      
      // Construct final start/end times in ISO format
      const startDateTime = new Date(`${modalDate}T${modalTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + modalDuration * 60000);
      
      formData.set("start_time", startDateTime.toISOString());
      formData.set("end_time", endDateTime.toISOString());

      await createAdminBooking(formData);
      setSelectedSlot(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsPending(false);
    }
  }

  // Filter bookings for the selected day
  const dailyBookings = useMemo(() => {
    return bookings.filter(b => {
      const bDate = parseISO(b.start_time);
      return isSameDay(bDate, selectedDate) && b.status !== 'CANCELLED';
    });
  }, [bookings, selectedDate]);

  // Dynamically compute START and END hours for the day to avoid empty grid
  const { startHour, endHour } = useMemo(() => {
    if (dailyBookings.length === 0) {
      return { startHour: 8, endHour: 19 }; // Compact default: 8:00 - 19:00
    }
    
    let minHour = 8;
    let maxHour = 19;

    dailyBookings.forEach((b) => {
      const start = parseISO(b.start_time).getHours();
      const end = parseISO(b.end_time).getHours() + 1;
      if (start < minHour) minHour = start;
      if (end > maxHour) maxHour = end;
    });

    // Add 1 hour padding around commitments
    const finalStart = Math.max(0, minHour - 1);
    const finalEnd = Math.min(24, maxHour + 1);

    return { startHour: finalStart, endHour: finalEnd };
  }, [dailyBookings]);

  // Calculate total slots based on dynamic hours
  const totalMinutes = (endHour - startHour) * 60;
  const numSlots = totalMinutes / SLOT_MINUTES;

  // Calculate groomer load per slot
  const groomerLoad = useMemo(() => {
    const load = new Array(numSlots).fill(0);
    const baseDate = new Date(selectedDate);
    baseDate.setHours(startHour, 0, 0, 0);

    dailyBookings.forEach(b => {
      if (b.service_type === "ASSISTED_WASH" || b.service_type === "FULL_GROOMING") {
        const start = parseISO(b.start_time);
        const end = parseISO(b.end_time);
        
        for (let i = 0; i < numSlots; i++) {
          const slotStart = addMinutes(baseDate, i * SLOT_MINUTES);
          const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
          
          if (start < slotEnd && end > slotStart) {
            load[i]++;
          }
        }
      }
    });
    return load;
  }, [dailyBookings, numSlots, selectedDate, startHour]);

  // Generate 11 days strip (5 days before, today, 5 days after)
  const dateStrip = useMemo(() => {
    const dates = [];
    for (let i = -5; i <= 5; i++) {
      dates.push(addDays(selectedDate, i));
    }
    return dates;
  }, [selectedDate]);

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const params = new URLSearchParams(window.location.search);
    params.set("from", dateStr);
    params.set("to", dateStr);
    router.push(`/admin/prenotazioni?${params.toString()}`);
  };

  // Check if a day has any booking in our loaded bookings list
  const hasBookingOnDay = (date: Date) => {
    return bookings.some(b => isSameDay(parseISO(b.start_time), date) && b.status !== 'CANCELLED');
  };

  // Start times list for the modal dropdown
  const modalTimeOptions = useMemo(() => {
    const options = [];
    for (let h = startHour; h < endHour; h++) {
      options.push(`${String(h).padStart(2, "0")}:00`);
      options.push(`${String(h).padStart(2, "0")}:30`);
    }
    return options;
  }, [startHour, endHour]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      
      {/* 1. DATE SELECTOR CAROUSEL (WEEK STRIP) */}
      <div className="bg-slate-900/40 backdrop-blur-md border-b border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" /> Calendario Rapido
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            {format(selectedDate, "EEEE d MMMM yyyy", { locale: it })}
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {dateStrip.map((date, idx) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, new Date());
            const hasBookings = hasBookingOnDay(date);

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(date)}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center justify-center w-14 py-2.5 rounded-xl border transition-all duration-200",
                  isSelected
                    ? "bg-gradient-to-b from-cyan-500 to-blue-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/10 scale-105"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                )}
              >
                <span className="text-[9px] uppercase tracking-wider font-bold mb-0.5 opacity-80">
                  {format(date, "EEE", { locale: it }).slice(0, 3)}
                </span>
                <span className="text-base font-bold leading-none">
                  {format(date, "d")}
                </span>
                <span className="text-[9px] opacity-75 mt-0.5">
                  {format(date, "MMM", { locale: it })}
                </span>
                
                {/* Dots indicator */}
                {hasBookings && (
                  <span className={cn(
                    "w-1 h-1 rounded-full mt-1.5",
                    isSelected ? "bg-white" : isToday ? "bg-cyan-400" : "bg-slate-400"
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. OPERATOR LOAD INDICATOR */}
      <div className="bg-slate-900 border-b border-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Carico Operatori ({maxConcurrentAssisted} max)
        </h3>
        <div className="flex w-full h-8 rounded-lg overflow-hidden border border-slate-800 bg-slate-950/40">
          {groomerLoad.map((load, i) => {
            const isOverloaded = load > maxConcurrentAssisted;
            const isFull = load === maxConcurrentAssisted;
            const isEmpty = load === 0;
            return (
              <div 
                key={i} 
                className={cn(
                  "flex-1 border-r border-slate-800/50 last:border-r-0 transition-colors relative group",
                  isEmpty ? "bg-slate-900/10" : isOverloaded ? "bg-red-500/80" : isFull ? "bg-amber-500/80" : "bg-emerald-500/60"
                )}
              >
                {/* Tooltip */}
                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700">
                  {format(addMinutes(new Date().setHours(startHour, 0, 0, 0), i * SLOT_MINUTES), 'HH:mm')} - {load} prenotazioni assistite
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CALENDAR GRID */}
      <div className="flex-1 overflow-auto relative">
        <div className="min-w-[800px] flex">
          
          {/* Time Column */}
          <div className="w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/30 sticky left-0 z-20 backdrop-blur-sm">
            <div className="h-12 border-b border-slate-800 bg-slate-900 sticky top-0 z-30" />
            {Array.from({ length: endHour - startHour }).map((_, i) => (
              <div key={i} className="h-24 border-b border-slate-800/50 relative">
                <span className="absolute -top-3 left-2 text-[10px] font-bold text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800/60">
                  {String(startHour + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Stations Columns */}
          {stations.map(station => (
            <div key={station.id} className="flex-1 border-r border-slate-800/50 relative min-w-[200px]">
              {/* Station Header */}
              <div className="h-12 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm sticky top-0 z-20 flex flex-col justify-center items-center px-2 text-center">
                <p className="text-sm font-semibold text-slate-200 truncate w-full">{station.name}</p>
                <p className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">{station.type}</p>
              </div>

              {/* Grid Background */}
              <div className="relative" style={{ height: `${(endHour - startHour) * 96}px` }}>
                {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="h-12 border-b border-slate-800/20 hover:bg-slate-800/20 transition-colors cursor-pointer relative group"
                    onClick={() => {
                      const time = addMinutes(new Date(selectedDate).setHours(startHour, 0, 0, 0), i * 30);
                      setSelectedSlot({ stationId: station.id, time });
                    }}
                  >
                    <div className="absolute inset-0 items-center justify-center hidden group-hover:flex">
                      <Plus className="w-4 h-4 text-cyan-500/80" />
                    </div>
                  </div>
                ))}

                {/* Bookings */}
                {dailyBookings.filter(b => b.station_id === station.id).map(booking => {
                  const start = parseISO(booking.start_time);
                  const end = parseISO(booking.end_time);
                  
                  const startTotalMinutes = (start.getHours() * 60 + start.getMinutes()) - (startHour * 60);
                  const durationMins = differenceInMinutes(end, start);
                  
                  // 1 minute = 1.6px (96px per hour)
                  const top = startTotalMinutes * 1.6;
                  const height = durationMins * 1.6;

                  let bgColor = "bg-cyan-500/10 border-cyan-500/40 hover:border-cyan-400";
                  let textColor = "text-cyan-300";
                  let Icon = PawPrint;
                  let label = "Self-Service";

                  if (booking.service_type === "ASSISTED_WASH") {
                    bgColor = "bg-blue-500/10 border-blue-500/40 hover:border-blue-400";
                    textColor = "text-blue-300";
                    Icon = Sparkles;
                    label = "Assistito";
                  } else if (booking.service_type === "FULL_GROOMING") {
                    bgColor = "bg-fuchsia-500/10 border-fuchsia-500/40 hover:border-fuchsia-400";
                    textColor = "text-fuchsia-300";
                    Icon = Scissors;
                    label = "Grooming";
                  }

                  return (
                    <div
                      key={booking.id}
                      className={cn(
                        "absolute left-1.5 right-1.5 rounded-xl border shadow-xl flex flex-col p-2 transition-all hover:ring-2 hover:ring-white/20 hover:z-10",
                        bgColor
                      )}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className={cn("w-3.5 h-3.5 shrink-0", textColor)} />
                          <span className={cn("text-[10px] font-extrabold uppercase tracking-wide truncate", textColor)}>{label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">
                          {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                        </span>
                      </div>
                      
                      {height >= 48 && (
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                          <div className="text-xs font-bold text-slate-100 truncate">
                            {dogNames[booking.dog_id] || "Cane sconosciuto"}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {customerNames[booking.customer_id] || "Cliente"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. ADMIN BOOKING MODAL (ADJUSTABLE DATE/TIME/DURATION) */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-slate-200">Nuova Prenotazione (Admin)</h3>
              <button onClick={() => setSelectedSlot(null)} className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form action={handleCreate} className="p-5 space-y-4">
              <input type="hidden" name="station_id" value={selectedSlot.stationId} />
              
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-sm text-slate-300 space-y-1">
                <p><strong>Postazione:</strong> {stations.find(s => s.id === selectedSlot.stationId)?.name}</p>
              </div>

              {/* DATE & TIME ADJUSTMENT FIELDS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Data</label>
                  <input
                    type="date"
                    required
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Ora Inizio</label>
                  <select
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    {modalTimeOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* DURATION FIELD */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Durata</label>
                <select
                  value={modalDuration}
                  onChange={(e) => setModalDuration(Number(e.target.value))}
                  className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value={30}>30 minuti</option>
                  <option value={45}>45 minuti</option>
                  <option value={60}>1 ora (60 min)</option>
                  <option value={90}>1 ora e 30 min (90 min)</option>
                  <option value={120}>2 ore (120 min)</option>
                  <option value={150}>2 ore e 30 min (150 min)</option>
                  <option value={180}>3 ore (180 min)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Cliente</label>
                <select 
                  name="customer_id" 
                  required 
                  className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">Seleziona cliente...</option>
                  {allProfiles.map(p => {
                    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
                    return <option key={p.id} value={p.id}>{fullName || p.email}</option>;
                  })}
                </select>
              </div>

              {selectedCustomerId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-medium text-slate-200">Cane</label>
                  <select name="dog_id" required className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500">
                    {customerDogs.length === 0 && <option value="">Nessun cane trovato</option>}
                    {customerDogs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Servizio</label>
                <select name="service_type" required className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500">
                  <option value="SELF_SERVICE">Self Service (Nessuna assistenza)</option>
                  <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                  <option value="FULL_GROOMING">Toelettatura Completa</option>
                </select>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isPending || !selectedCustomerId || customerDogs.length === 0} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl py-3 font-semibold transition-all">
                  {isPending ? "Salvataggio..." : "Salva Prenotazione (0 crediti)"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
