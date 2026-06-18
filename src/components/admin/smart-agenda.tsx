"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { format, parseISO, startOfDay, addMinutes, isSameDay, differenceInMinutes, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { PawPrint, Sparkles, AlertTriangle, Search, Plus, Calendar as CalendarIcon, Clock, User, Scissors, X, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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
const HOUR_HEIGHT = 60;
const MINUTE_SCALE = 1.0;

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
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"giorno" | "settimana">("settimana");
  
  // Normalize selected date
  const selectedDate = useMemo(() => {
    if (!selectedDateStr) return new Date();
    return parseISO(selectedDateStr.includes("T") ? selectedDateStr : `${selectedDateStr}T12:00:00`);
  }, [selectedDateStr]);

  const [selectedSlot, setSelectedSlot] = useState<{ stationId: string; time: Date } | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isPending, setIsPending] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Modal form states
  const [modalDate, setModalDate] = useState<string>("");
  const [modalTime, setModalTime] = useState<string>("");
  const [modalDuration, setModalDuration] = useState<number>(30);
  const [modalStationId, setModalStationId] = useState<string>("");

  // Update current time indicator every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Initialize modal states when a slot is clicked
  useEffect(() => {
    if (selectedSlot) {
      setModalDate(format(selectedSlot.time, "yyyy-MM-dd"));
      setModalTime(format(selectedSlot.time, "HH:mm"));
      setModalDuration(30);
      setModalStationId(selectedSlot.stationId || stations[0]?.id || "");
    }
  }, [selectedSlot, stations]);

  const customerDogs = useMemo(() => {
    return allDogs.filter(d => d.customer_id === selectedCustomerId);
  }, [allDogs, selectedCustomerId]);

  async function handleCreate(formData: FormData) {
    try {
      setIsPending(true);
      
      const startDateTime = new Date(`${modalDate}T${modalTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + modalDuration * 60000);
      
      formData.set("station_id", modalStationId);
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

  // Calculate week days relative to selectedDate (Monday to Sunday)
  const weekDays = useMemo(() => {
    const date = new Date(selectedDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.getTime());
    monday.setDate(diff);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(monday, i));
    }
    return days;
  }, [selectedDate]);

  // Filter bookings for the selected day (Giorno view)
  const dailyBookings = useMemo(() => {
    return bookings.filter(b => {
      const bDate = parseISO(b.start_time);
      return isSameDay(bDate, selectedDate) && b.status !== 'CANCELLED';
    });
  }, [bookings, selectedDate]);

  // Filter bookings for the entire week (Settimana view)
  const weeklyBookings = useMemo(() => {
    return bookings.filter(b => {
      const bDate = parseISO(b.start_time);
      return weekDays.some(wd => isSameDay(wd, bDate)) && b.status !== 'CANCELLED';
    });
  }, [bookings, weekDays]);

  // Dynamically compute START and END hours for the day or week to avoid empty grid space
  const { startHour, endHour } = useMemo(() => {
    const activeBookings = viewMode === "giorno" ? dailyBookings : weeklyBookings;
    if (activeBookings.length === 0) {
      return { startHour: 8, endHour: 19 }; // Compact default
    }
    
    let minHour = 8;
    let maxHour = 19;

    activeBookings.forEach((b) => {
      const start = parseISO(b.start_time).getHours();
      const end = parseISO(b.end_time).getHours() + 1;
      if (start < minHour) minHour = start;
      if (end > maxHour) maxHour = end;
    });

    const finalStart = Math.max(0, minHour - 1);
    const finalEnd = Math.min(24, maxHour + 1);

    return { startHour: finalStart, endHour: finalEnd };
  }, [dailyBookings, weeklyBookings, viewMode]);

  // Calculate total slots based on dynamic hours
  const totalMinutes = (endHour - startHour) * 60;
  const numSlots = totalMinutes / SLOT_MINUTES;

  // Calculate operator/groomer load per slot (active view dependent)
  const groomerLoad = useMemo(() => {
    const load = new Array(numSlots).fill(0);
    const baseDate = new Date(selectedDate);
    baseDate.setHours(startHour, 0, 0, 0);

    const activeBookings = viewMode === "giorno" ? dailyBookings : weeklyBookings;

    activeBookings.forEach(b => {
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
  }, [dailyBookings, weeklyBookings, viewMode, numSlots, selectedDate, startHour]);

  // Carousel date range strip (6 days before, selected, 6 days after)
  const dateStrip = useMemo(() => {
    const dates = [];
    for (let i = -6; i <= 6; i++) {
      dates.push(addDays(selectedDate, i));
    }
    return dates;
  }, [selectedDate]);

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const params = new URLSearchParams(window.location.search);
    
    // Set from/to range to Monday-Sunday of the clicked date to ensure weekly view data is fetched
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.getTime());
    monday.setDate(diff);
    const sunday = addDays(monday, 6);

    params.set("date", dateStr);
    params.set("from", format(monday, "yyyy-MM-dd"));
    params.set("to", format(sunday, "yyyy-MM-dd"));
    
    router.push(`/admin/prenotazioni?${params.toString()}`);
  };

  const shiftSelectedDate = (days: number) => {
    const newDate = addDays(selectedDate, days);
    handleDateClick(newDate);
  };

  const hasBookingOnDay = (date: Date) => {
    return bookings.some(b => isSameDay(parseISO(b.start_time), date) && b.status !== 'CANCELLED');
  };

  const modalTimeOptions = useMemo(() => {
    const options = [];
    for (let h = startHour; h < endHour; h++) {
      options.push(`${String(h).padStart(2, "0")}:00`);
      options.push(`${String(h).padStart(2, "0")}:30`);
    }
    return options;
  }, [startHour, endHour]);

  // Current time line calculation
  const showCurrentTimeLine = isSameDay(selectedDate, currentTime);
  const currentTimePosition = useMemo(() => {
    if (!showCurrentTimeLine) return 0;
    const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startMins = startHour * 60;
    const diff = currentMins - startMins;
    return diff * MINUTE_SCALE;
  }, [currentTime, showCurrentTimeLine, startHour]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl transition-all duration-300">
      
      {/* 1. APPLE-STYLE DATE STRIP CAROUSEL WITH VIEW SELECTOR */}
      <div className="bg-slate-900/30 backdrop-blur-md border-b border-slate-800/80 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" /> Calendario Impegni
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold">
              {format(selectedDate, "EEEE d MMMM yyyy", { locale: it })}
            </p>
          </div>
          
          {/* Day / Week View Selector Switch */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 shadow-inner">
            <button
              onClick={() => setViewMode("giorno")}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200",
                viewMode === "giorno" 
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Giorno
            </button>
            <button
              onClick={() => setViewMode("settimana")}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200",
                viewMode === "settimana" 
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Settimana
            </button>
          </div>
        </div>
        
        {/* Navigation Chevrons + Scrollable list */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => shiftSelectedDate(-7)} 
            className="p-2 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:bg-slate-800 hover:text-white text-slate-400 transition-colors"
            title="Settimana precedente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {dateStrip.map((date, idx) => {
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, new Date());
              const hasBookings = hasBookingOnDay(date);

              return (
                <button
                  key={idx}
                  onClick={() => handleDateClick(date)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center justify-center w-[52px] py-2.5 rounded-xl border transition-all duration-300 relative overflow-hidden group",
                    isSelected
                      ? "bg-gradient-to-b from-cyan-500 to-blue-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/20 scale-105"
                      : "bg-slate-900/40 border-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                  )}
                >
                  <span className="text-[8px] uppercase tracking-wider font-extrabold mb-0.5 opacity-70">
                    {format(date, "EEE", { locale: it }).slice(0, 3)}
                  </span>
                  <span className="text-sm font-black leading-none">
                    {format(date, "d")}
                  </span>
                  <span className="text-[8px] opacity-70 mt-0.5 font-medium">
                    {format(date, "MMM", { locale: it })}
                  </span>
                  
                  {/* Dots indicator */}
                  {hasBookings && (
                    <span className={cn(
                      "w-1 h-1 rounded-full mt-1 transition-all",
                      isSelected ? "bg-white scale-125" : isToday ? "bg-cyan-400" : "bg-slate-500"
                    )} />
                  )}
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => shiftSelectedDate(7)} 
            className="p-2 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:bg-slate-800 hover:text-white text-slate-400 transition-colors"
            title="Settimana successiva"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. OPERATOR LOAD INDICATOR (Fresha Style) */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Carico Operatori ({maxConcurrentAssisted} max)
          </h3>
          <span className="text-[10px] text-slate-500 font-semibold">Attività su base oraria</span>
        </div>
        <div className="flex w-full h-3 rounded-full overflow-hidden border border-slate-800/60 bg-slate-950/80 p-[1.5px]">
          {groomerLoad.map((load, i) => {
            const isOverloaded = load > maxConcurrentAssisted;
            const isFull = load === maxConcurrentAssisted;
            const isEmpty = load === 0;
            return (
              <div 
                key={i} 
                className={cn(
                  "flex-1 rounded-[2px] mx-[0.5px] transition-colors relative group",
                  isEmpty ? "bg-slate-800/20" : isOverloaded ? "bg-rose-500" : isFull ? "bg-amber-500" : "bg-emerald-500"
                )}
              >
                {/* Tooltip */}
                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-100 text-[10px] py-1.5 px-2.5 rounded-lg pointer-events-none whitespace-nowrap z-50 shadow-2xl border border-slate-800/80 font-bold transition-all">
                  {format(addMinutes(new Date().setHours(startHour, 0, 0, 0), i * SLOT_MINUTES), 'HH:mm')} - {load} prenotazioni assistite
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. GOOGLE CALENDAR GRID (GIORNO / SETTIMANA DETTAGLI) */}
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-slate-950 animate-in fade-in duration-300" ref={gridContainerRef}>
        <div className="min-w-[800px] flex relative select-none">
          
          {/* Time Axis Column - Height: 60px per hour */}
          <div className="w-16 flex-shrink-0 border-r border-slate-800 bg-slate-950 sticky left-0 z-20 shadow-2xl">
            <div className="h-12 border-b border-slate-800/80 bg-slate-950 sticky top-0 z-30" />
            {Array.from({ length: endHour - startHour }).map((_, i) => (
              <div key={i} className="h-[60px] border-b border-slate-800/30 relative">
                <span className="absolute -top-2.5 left-2 text-[10px] font-black tracking-tight text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800/60 shadow-md">
                  {String(startHour + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* ────────────────── COLONNE GIORNO (Postazioni) ────────────────── */}
          {viewMode === "giorno" && stations.map(station => (
            <div key={station.id} className="flex-1 border-r border-slate-800/60 relative min-w-[200px] group/col">
              
              {/* Sticky Station Header */}
              <div className="h-12 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-10 flex flex-col justify-center items-center px-2 text-center shadow-sm">
                <p className="text-xs font-black text-slate-200 truncate w-full tracking-tight">{station.name}</p>
                <p className="text-[8px] text-cyan-400/80 font-extrabold uppercase tracking-widest mt-0.5">{station.type.replace('_', ' ')}</p>
              </div>

              {/* Grid Background */}
              <div className="relative bg-slate-950" style={{ height: `${(endHour - startHour) * HOUR_HEIGHT}px` }}>
                {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => {
                  const isHourLine = i % 2 === 0;
                  const time = addMinutes(new Date(selectedDate).setHours(startHour, 0, 0, 0), i * 30);
                  
                  return (
                    <div 
                      key={i} 
                      className={cn(
                        "transition-colors cursor-pointer relative group/cell flex items-center justify-center",
                        isHourLine ? "border-b border-slate-800/40" : "border-b border-dashed border-slate-800/25",
                        "hover:bg-slate-900/30"
                      )}
                      style={{ height: '30px' }}
                      onClick={() => {
                        setSelectedSlot({ stationId: station.id, time });
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity bg-cyan-500/[0.03]">
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-cyan-400 text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg">
                          <Plus className="w-3 h-3" />
                          <span>{format(time, 'HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Daily Bookings */}
                {dailyBookings.filter(b => b.station_id === station.id).map(booking => {
                  const start = parseISO(booking.start_time);
                  const end = parseISO(booking.end_time);
                  const startTotalMinutes = (start.getHours() * 60 + start.getMinutes()) - (startHour * 60);
                  const durationMins = differenceInMinutes(end, start);
                  
                  const top = startTotalMinutes * MINUTE_SCALE;
                  const height = durationMins * MINUTE_SCALE;

                  let accentColor = "from-cyan-500 to-blue-600";
                  let bgColors = "bg-cyan-500/[0.08] hover:bg-cyan-500/[0.12] border-cyan-500/30 shadow-cyan-500/[0.02]";
                  let textPrimary = "text-cyan-200";
                  let Icon = PawPrint;
                  let label = "Self-Service";

                  if (booking.service_type === "ASSISTED_WASH") {
                    accentColor = "from-blue-500 to-indigo-600";
                    bgColors = "bg-blue-500/[0.08] hover:bg-blue-500/[0.12] border-blue-500/30 shadow-blue-500/[0.02]";
                    textPrimary = "text-blue-200";
                    Icon = Sparkles;
                    label = "Assistito";
                  } else if (booking.service_type === "FULL_GROOMING") {
                    accentColor = "from-fuchsia-500 to-pink-600";
                    bgColors = "bg-fuchsia-500/[0.08] hover:bg-fuchsia-500/[0.12] border-fuchsia-500/30 shadow-fuchsia-500/[0.02]";
                    textPrimary = "text-fuchsia-200";
                    Icon = Scissors;
                    label = "Grooming";
                  }

                  return (
                    <div
                      key={booking.id}
                      className={cn(
                        "absolute left-2.5 right-2.5 rounded-xl border flex flex-row overflow-hidden p-0 transition-all duration-300 hover:ring-2 hover:ring-white/10 hover:shadow-2xl hover:z-10 cursor-pointer active:scale-[0.98]",
                        bgColors
                      )}
                      style={{ top: `${top + 1.5}px`, height: `${height - 3}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSlot({ stationId: booking.station_id, time: start });
                        setSelectedCustomerId(booking.customer_id);
                        setModalDuration(durationMins);
                      }}
                    >
                      <div className={cn("w-1 shrink-0 bg-gradient-to-b", accentColor)} />
                      <div className="flex-1 flex flex-col p-1.5 min-w-0 justify-between">
                        {height < 38 ? (
                          <div className="flex items-center justify-between gap-1.5 w-full h-full">
                            <div className="flex items-center gap-1 min-w-0">
                              <Icon className={cn("w-3 h-3 shrink-0", textPrimary)} />
                              <span className="text-[10px] font-black text-slate-100 truncate">
                                {dogNames[booking.dog_id] || "Sconosciuto"}
                              </span>
                            </div>
                            <span className="text-[8.5px] font-bold text-slate-400 shrink-0">
                              {format(start, 'HH:mm')}
                            </span>
                          </div>
                        ) : height < 64 ? (
                          <div className="flex flex-col justify-between h-full">
                            <div className="flex items-center justify-between gap-1 shrink-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <Icon className={cn("w-3 h-3 shrink-0", textPrimary)} />
                                <span className={cn("text-[8.5px] font-extrabold uppercase tracking-wide truncate", textPrimary)}>{label}</span>
                              </div>
                              <span className="text-[8.5px] font-bold text-slate-400 shrink-0">
                                {format(start, 'HH:mm')}
                              </span>
                            </div>
                            <div className="text-[10px] font-black text-slate-100 truncate mt-0.5">
                              {dogNames[booking.dog_id] || "Sconosciuto"}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <Icon className={cn("w-3.5 h-3.5 shrink-0", textPrimary)} />
                                <span className={cn("text-[9px] font-black uppercase tracking-wider truncate", textPrimary)}>{label}</span>
                              </div>
                              <span className="text-[9px] font-black text-slate-400 shrink-0">
                                {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                              </span>
                            </div>
                            <div className="flex-1 flex flex-col justify-center min-w-0">
                              <div className="text-xs font-black text-slate-100 truncate flex items-center gap-1">
                                <PawPrint className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {dogNames[booking.dog_id] || "Sconosciuto"}
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold truncate mt-0.5 flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                {customerNames[booking.customer_id] || "Cliente"}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ────────────────── COLONNE SETTIMANA (Giorni Settimana) ────────────────── */}
          {viewMode === "settimana" && weekDays.map((day, idx) => {
            const isToday = isSameDay(day, new Date());
            const isActiveDay = isSameDay(day, selectedDate);
            const dayBookings = weeklyBookings.filter(b => isSameDay(parseISO(b.start_time), day));

            return (
              <div key={idx} className={cn("flex-1 border-r border-slate-800/60 relative min-w-[130px] group/col")}>
                
                {/* Sticky Day Header */}
                <div className={cn(
                  "h-12 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-10 flex flex-col justify-center items-center py-2 text-center shadow-sm",
                  isActiveDay ? "bg-slate-900/40" : ""
                )}>
                  <p className={cn(
                    "text-[8px] font-extrabold uppercase tracking-widest",
                    isToday ? "text-cyan-400" : "text-slate-500"
                  )}>
                    {format(day, "EEEE", { locale: it }).slice(0, 3)}
                  </p>
                  <p className={cn(
                    "text-xs font-black mt-0.5 w-6 h-6 flex items-center justify-center rounded-full leading-none",
                    isToday 
                      ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" 
                      : isActiveDay 
                        ? "bg-slate-800 text-slate-200" 
                        : "text-slate-300"
                  )}>
                    {format(day, "d")}
                  </p>
                </div>

                {/* Grid Cells */}
                <div className="relative bg-slate-950" style={{ height: `${(endHour - startHour) * HOUR_HEIGHT}px` }}>
                  {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => {
                    const isHourLine = i % 2 === 0;
                    const time = addMinutes(new Date(day).setHours(startHour, 0, 0, 0), i * 30);
                    
                    return (
                      <div 
                        key={i} 
                        className={cn(
                          "transition-colors cursor-pointer relative group/cell flex items-center justify-center",
                          isHourLine ? "border-b border-slate-800/40" : "border-b border-dashed border-slate-800/25",
                          "hover:bg-slate-900/30"
                        )}
                        style={{ height: '30px' }}
                        onClick={() => {
                          setSelectedSlot({ stationId: "", time });
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity bg-cyan-500/[0.03]">
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-cyan-400 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-lg">
                            <Plus className="w-3 h-3" />
                            <span>{format(time, 'HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Weekly Bookings for this column day */}
                  {dayBookings.map(booking => {
                    const start = parseISO(booking.start_time);
                    const end = parseISO(booking.end_time);
                    const startTotalMinutes = (start.getHours() * 60 + start.getMinutes()) - (startHour * 60);
                    const durationMins = differenceInMinutes(end, start);
                    
                    const top = startTotalMinutes * MINUTE_SCALE;
                    const height = durationMins * MINUTE_SCALE;

                    let accentColor = "from-cyan-500 to-blue-600";
                    let bgColors = "bg-cyan-500/[0.08] hover:bg-cyan-500/[0.12] border-cyan-500/30 shadow-cyan-500/[0.02]";
                    let textPrimary = "text-cyan-200";
                    let Icon = PawPrint;
                    let label = "Self-Service";

                    if (booking.service_type === "ASSISTED_WASH") {
                      accentColor = "from-blue-500 to-indigo-600";
                      bgColors = "bg-blue-500/[0.08] hover:bg-blue-500/[0.12] border-blue-500/30 shadow-blue-500/[0.02]";
                      textPrimary = "text-blue-200";
                      Icon = Sparkles;
                      label = "Assistito";
                    } else if (booking.service_type === "FULL_GROOMING") {
                      accentColor = "from-fuchsia-500 to-pink-600";
                      bgColors = "bg-fuchsia-500/[0.08] hover:bg-fuchsia-500/[0.12] border-fuchsia-500/30 shadow-fuchsia-500/[0.02]";
                      textPrimary = "text-fuchsia-200";
                      Icon = Scissors;
                      label = "Grooming";
                    }

                    // Retrieve active station name
                    const stName = stations.find(s => s.id === booking.station_id)?.name || "Postazione";

                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "absolute left-1 right-1 rounded-xl border flex flex-row overflow-hidden p-0 transition-all duration-300 hover:ring-2 hover:ring-white/10 hover:shadow-2xl hover:z-10 cursor-pointer active:scale-[0.98]",
                          bgColors
                        )}
                        style={{ top: `${top + 1.5}px`, height: `${height - 3}px` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlot({ stationId: booking.station_id, time: start });
                          setSelectedCustomerId(booking.customer_id);
                          setModalDuration(durationMins);
                        }}
                      >
                        <div className={cn("w-1 shrink-0 bg-gradient-to-b", accentColor)} />
                        <div className="flex-1 flex flex-col p-1 min-w-0 justify-between">
                          {height < 38 ? (
                            <div className="flex items-center justify-between gap-1 w-full h-full">
                              <span className="text-[9px] font-black text-slate-100 truncate">
                                {dogNames[booking.dog_id] || "Sconosciuto"}
                              </span>
                              <span className="text-[8px] font-bold text-slate-400 shrink-0">
                                {format(start, 'HH:mm')}
                              </span>
                            </div>
                          ) : height < 64 ? (
                            <div className="flex flex-col justify-between h-full">
                              <div className="flex items-center justify-between gap-0.5 shrink-0">
                                <span className="text-[8px] font-extrabold text-slate-300 truncate">{stName}</span>
                                <span className="text-[8px] font-bold text-slate-400 shrink-0">{format(start, 'HH:mm')}</span>
                              </div>
                              <div className="text-[10px] font-black text-slate-100 truncate">
                                {dogNames[booking.dog_id] || "Sconosciuto"}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-1 mb-0.5 shrink-0">
                                <span className="text-[8px] font-extrabold text-slate-300 truncate">{stName}</span>
                                <span className="text-[8px] font-bold text-slate-400 shrink-0">
                                  {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                                </span>
                              </div>
                              <div className="flex-1 flex flex-col justify-center min-w-0">
                                <div className="text-[11px] font-black text-slate-100 truncate flex items-center gap-1">
                                  <PawPrint className="w-3 h-3 text-slate-400 shrink-0" />
                                  {dogNames[booking.dog_id] || "Sconosciuto"}
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold truncate mt-0.5 flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-500 shrink-0" />
                                  {customerNames[booking.customer_id] || "Cliente"}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* DYNAMIC CURRENT TIME INDICATOR LINE */}
          {showCurrentTimeLine && currentTimePosition > 0 && currentTimePosition < (endHour - startHour) * HOUR_HEIGHT && (
            <div 
              className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
              style={{ top: `${currentTimePosition}px` }}
            >
              <div className="w-16 shrink-0 flex justify-end pr-1.5">
                <span className="text-[9px] font-black text-rose-500 bg-rose-950/60 border border-rose-500/30 px-1 py-0.5 rounded shadow">
                  {format(currentTime, 'HH:mm')}
                </span>
              </div>
              <div className="flex-1 h-[2px] bg-rose-500 relative">
                <span className="absolute -left-1 -top-[4px] w-[10px] h-[10px] bg-rose-500 rounded-full shadow-lg ring-4 ring-rose-500/20 animate-ping" />
                <span className="absolute -left-1 -top-[4px] w-[10px] h-[10px] bg-rose-500 rounded-full shadow-md" />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 4. ADMIN BOOKING MODAL */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-slate-200">Nuova Prenotazione (Bypass Admin)</h3>
              <button onClick={() => setSelectedSlot(null)} className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form action={handleCreate} className="p-5 space-y-4">
              
              {/* STATION SELECTION DROPDOWN */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Postazione</label>
                <select
                  value={modalStationId}
                  onChange={(e) => setModalStationId(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.type.replace('_', ' ')})</option>
                  ))}
                </select>
              </div>

              {/* DATE & TIME ADJUSTMENT FIELDS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Data</label>
                  <input
                    type="date"
                    required
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Ora Inizio</label>
                  <select
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    {modalTimeOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* DURATION FIELD */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Durata Servizio</label>
                <select
                  value={modalDuration}
                  onChange={(e) => setModalDuration(Number(e.target.value))}
                  className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
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
                <label className="text-sm font-semibold text-slate-200">Seleziona Cliente</label>
                <select 
                  name="customer_id" 
                  required 
                  className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">Cerca o seleziona...</option>
                  {allProfiles.map(p => {
                    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
                    return <option key={p.id} value={p.id}>{fullName || p.email}</option>;
                  })}
                </select>
              </div>

              {selectedCustomerId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-sm font-semibold text-slate-200">Scegli Cane</label>
                  <select name="dog_id" required className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors">
                    {customerDogs.length === 0 && <option value="">Nessun cane registrato</option>}
                    {customerDogs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Tipologia di Servizio</label>
                <select name="service_type" required className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors">
                  <option value="SELF_SERVICE">Self Service (Nessuna assistenza)</option>
                  <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                  <option value="FULL_GROOMING">Toelettatura Completa</option>
                </select>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isPending || !selectedCustomerId || customerDogs.length === 0} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl py-3 font-semibold transition-all">
                  {isPending ? "Salvataggio..." : "Conferma ed Inserisci"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded CSS for Custom Webkit Scrollbars */}
      <style jsx global>{`
        /* Hide scrollbars for week strip carousel */
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        /* Premium custom scrollbars for main grid */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(2, 6, 23, 0.4);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.6);
          border: 2px solid rgb(2, 6, 23);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.8);
        }
      `}</style>
    </div>
  );
}
