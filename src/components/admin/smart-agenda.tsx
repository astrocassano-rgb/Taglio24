"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { format, parseISO, startOfDay, addMinutes, isSameDay, differenceInMinutes, addDays, startOfMonth, isSameMonth } from "date-fns";
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
  owner_id: string;
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
  const [viewMode, setViewMode] = useState<"giorno" | "settimana" | "mese">("settimana");
  
  // Normalize selected date
  const selectedDate = useMemo(() => {
    if (!selectedDateStr) return new Date();
    return parseISO(selectedDateStr.includes("T") ? selectedDateStr : `${selectedDateStr}T12:00:00`);
  }, [selectedDateStr]);

  const [selectedSlot, setSelectedSlot] = useState<{ stationId: string; time: Date } | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedDogId, setSelectedDogId] = useState<string>("");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
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
      setModalStationId(selectedSlot.stationId || stations[0]?.id || "");
    }
  }, [selectedSlot, stations]);

  const customerDogs = useMemo(() => {
    return allDogs.filter(d => d.owner_id === selectedCustomerId);
  }, [allDogs, selectedCustomerId]);

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const dogs = allDogs.filter(d => d.owner_id === customerId);
    setSelectedDogId(dogs[0]?.id || "");
  };

  const selectedBooking = useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, selectedBookingId]);

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

  async function handleUpdateStatus(newStatus: string) {
    if (!selectedBookingId) return;
    if (!confirm(`Sei sicuro di voler cambiare lo stato di questa prenotazione a ${newStatus === 'CANCELLED' ? 'ANNULLATA' : newStatus}?`)) return;
    
    try {
      setIsPending(true);
      const res = await fetch("/api/admin/bookings/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: selectedBookingId,
          status: newStatus,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore durante l'aggiornamento.");
      }
      setSelectedSlot(null);
      router.refresh();
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

  // Generate 42 days grid for standard 6-week monthly calendar
  const monthDays = useMemo(() => {
    const start = startOfMonth(selectedDate);
    const startDay = start.getDay();
    const diffToMonday = start.getDate() - startDay + (startDay === 0 ? -6 : 1);
    const firstMonday = new Date(start.getTime());
    firstMonday.setDate(diffToMonday);
    
    const days = [];
    for (let i = 0; i < 42; i++) {
      days.push(addDays(firstMonday, i));
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

  // Monthly active bookings (includes month view bookings)
  const monthlyBookings = useMemo(() => {
    return bookings.filter(b => b.status !== 'CANCELLED');
  }, [bookings]);

  // Dynamically compute START and END hours for the day/week to avoid empty grid space
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

  // Calculate operator/groomer load per slot
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

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const params = new URLSearchParams(window.location.search);
    
    // Set from/to bounds to cover the entire month to ensure full month data is fetched
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    params.set("date", dateStr);
    params.set("from", format(start, "yyyy-MM-dd"));
    params.set("to", format(end, "yyyy-MM-dd"));
    
    router.push(`/admin/prenotazioni?${params.toString()}`);
  };

  const shiftSelectedDate = (amount: number) => {
    let newDate = new Date(selectedDate);
    if (viewMode === "mese") {
      newDate.setMonth(newDate.getMonth() + amount);
    } else if (viewMode === "settimana") {
      newDate = addDays(selectedDate, amount * 7);
    } else {
      newDate = addDays(selectedDate, amount);
    }
    handleDateClick(newDate);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(parseInt(e.target.value));
    handleDateClick(newDate);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(parseInt(e.target.value));
    handleDateClick(newDate);
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
  const showTimeBubble = useMemo(() => {
    if (viewMode === "giorno") {
      return isSameDay(selectedDate, currentTime);
    }
    if (viewMode === "settimana") {
      return weekDays.some(wd => isSameDay(wd, currentTime));
    }
    return false;
  }, [viewMode, selectedDate, weekDays, currentTime]);

  const currentTimePercent = useMemo(() => {
    const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startMins = startHour * 60;
    const diff = currentMins - startMins;
    return (diff / totalMinutes) * 100;
  }, [currentTime, startHour, totalMinutes]);

  // Date selection helper bounds
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const list = [];
    for (let y = currentYear - 3; y <= currentYear + 5; y++) {
      list.push(y);
    }
    return list;
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl transition-all duration-300">
      
      {/* 1. CALENDAR CONTROLS & DROPDOWN HEADER */}
      <div className="bg-slate-900/30 backdrop-blur-md border-b border-slate-800/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        
        {/* Title + Today Button */}
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" /> Calendario Impegni
          </h3>
          <button
            onClick={() => handleDateClick(new Date())}
            className="px-3 py-1.5 bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-[10px] font-black rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            Oggi
          </button>
        </div>

        {/* Date Navigator Month/Year dropdown Controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => shiftSelectedDate(-1)} 
            className="p-2 bg-slate-900 border border-slate-800/80 rounded-xl hover:bg-slate-850 text-slate-400 hover:text-white transition-colors"
            title={viewMode === "mese" ? "Mese precedente" : viewMode === "settimana" ? "Settimana precedente" : "Giorno precedente"}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Month Selector */}
          <select
            value={selectedDate.getMonth()}
            onChange={handleMonthChange}
            className="h-9 rounded-xl bg-slate-900 border border-slate-800 px-3 text-xs font-black text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
          >
            {months.map((m, idx) => (
              <option key={idx} value={idx}>{m}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={selectedDate.getFullYear()}
            onChange={handleYearChange}
            className="h-9 rounded-xl bg-slate-900 border border-slate-800 px-3 text-xs font-black text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button 
            onClick={() => shiftSelectedDate(1)} 
            className="p-2 bg-slate-900 border border-slate-800/80 rounded-xl hover:bg-slate-850 text-slate-400 hover:text-white transition-colors"
            title={viewMode === "mese" ? "Mese successivo" : viewMode === "settimana" ? "Settimana successivo" : "Giorno successivo"}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day / Week / Month View Selector Tab Switch */}
        <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 shadow-inner">
          <button
            onClick={() => setViewMode("giorno")}
            className={cn(
              "px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200",
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
              "px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200",
              viewMode === "settimana" 
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md" 
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            Settimana
          </button>
          <button
            onClick={() => setViewMode("mese")}
            className={cn(
              "px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200",
              viewMode === "mese" 
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md" 
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            Mese
          </button>
        </div>
      </div>

      {/* 2. OPERATOR LOAD INDICATOR (Not rendered for Month View) */}
      {viewMode !== "mese" && (
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
      )}

      {/* 3. GRID CONTENT CONTAINER */}
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-slate-950">
                {/* ────────────────── VIEW MODE: GIORNO / SETTIMANA ────────────────── */}
        {viewMode !== "mese" && (
          <div className={cn(
            "flex relative select-none h-full w-full",
            viewMode === "giorno" ? "min-w-[800px]" : "min-w-0"
          )}>
            {/* Time Axis Column */}
            <div className="w-16 flex-shrink-0 border-r border-slate-800 bg-slate-950 sticky left-0 z-20 shadow-2xl flex flex-col h-full">
              <div className="h-12 border-b border-slate-800/80 bg-slate-950 sticky top-0 z-30 shrink-0" />
              <div className="flex-1 flex flex-col relative pb-2">
                {Array.from({ length: endHour - startHour }).map((_, i) => (
                  <div key={i} className="flex-1 border-b border-slate-800/30 relative flex items-start">
                    <span className="absolute -top-2.5 left-2 text-[10px] font-black tracking-tight text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800/60 shadow-md">
                      {String(startHour + i).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
                {showTimeBubble && currentTimePercent > 0 && currentTimePercent < 100 && (
                  <div 
                    className="absolute right-1.5 z-30 pointer-events-none -translate-y-1/2 flex items-center gap-1"
                    style={{ top: `${currentTimePercent}%` }}
                  >
                    <span className="text-[9px] font-black text-rose-500 bg-rose-950 border border-rose-500/30 px-1.5 py-0.5 rounded-lg shadow-lg">
                      {format(currentTime, 'HH:mm')}
                    </span>
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0 animate-ping" />
                  </div>
                )}
              </div>
            </div>

            {/* Column Render: GIORNO (Postazioni) */}
            {viewMode === "giorno" && stations.map(station => (
              <div key={station.id} className="flex-1 border-r border-slate-800/60 relative min-w-[200px] group/col flex flex-col h-full">
                <div className="h-12 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-10 flex flex-col justify-center items-center px-2 text-center shadow-sm shrink-0">
                  <p className="text-xs font-black text-slate-200 truncate w-full tracking-tight">{station.name}</p>
                  <p className="text-[8px] text-cyan-400/80 font-extrabold uppercase tracking-widest mt-0.5">{station.type.replace('_', ' ')}</p>
                </div>

                <div className="relative bg-slate-950 flex-1 min-h-[300px]">
                  {/* Slots background grid */}
                  <div className="absolute inset-0 flex flex-col">
                    {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => {
                      const isHourLine = i % 2 === 0;
                      const time = addMinutes(new Date(selectedDate).setHours(startHour, 0, 0, 0), i * 30);
                      return (
                        <div 
                          key={i} 
                          className={cn(
                            "transition-colors cursor-pointer relative group/cell flex-1 flex items-center justify-center min-h-[15px]",
                            isHourLine ? "border-b border-slate-800/40" : "border-b border-dashed border-slate-800/25",
                            "hover:bg-slate-900/30"
                          )}
                          onClick={() => {
                            setSelectedSlot({ stationId: station.id, time });
                            setSelectedCustomerId("");
                            setSelectedDogId("");
                            setSelectedBookingId("");
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity bg-cyan-500/[0.03]">
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-cyan-400 text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg">
                              <Plus className="w-3.5 h-3.5" />
                              <span>{format(time, 'HH:mm')}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* CURRENT TIME LINE WITHIN COLUMN */}
                  {isSameDay(selectedDate, currentTime) && currentTimePercent > 0 && currentTimePercent < 100 && (
                    <div 
                      className="absolute left-0 right-0 h-[2px] bg-rose-500/80 z-20 pointer-events-none -translate-y-1/2"
                      style={{ top: `${currentTimePercent}%` }}
                    />
                  )}

                  {/* Absolute booking cards */}
                  {dailyBookings.filter(b => b.station_id === station.id).map(booking => {
                    const start = parseISO(booking.start_time);
                    const end = parseISO(booking.end_time);
                    
                    // Clamp to active hours range
                    const startMins = Math.max(0, (start.getHours() * 60 + start.getMinutes()) - (startHour * 60));
                    const endMins = Math.min(totalMinutes, (end.getHours() * 60 + end.getMinutes()) - (startHour * 60));
                    const durationMins = Math.max(15, endMins - startMins);
                    
                    const topPercent = (startMins / totalMinutes) * 100;
                    const heightPercent = (durationMins / totalMinutes) * 100;

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
                        style={{ top: `calc(${topPercent}% + 2px)`, height: `calc(${heightPercent}% - 4px)` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlot({ stationId: booking.station_id, time: start });
                          setSelectedCustomerId(booking.customer_id);
                          setSelectedDogId(booking.dog_id);
                          setSelectedBookingId(booking.id);
                          setModalDuration(differenceInMinutes(end, start));
                        }}
                      >
                        <div className={cn("w-1 shrink-0 bg-gradient-to-b", accentColor)} />
                        <div className="flex-1 flex flex-col p-1.5 min-w-0 justify-between h-full overflow-hidden">
                          {/* Header row */}
                          <div className="flex items-center justify-between gap-1 w-full min-w-0 shrink-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <Icon className={cn("w-3 h-3 shrink-0", textPrimary)} />
                              <span className={cn("text-[8.5px] font-extrabold uppercase tracking-wide truncate hidden md:inline-block", textPrimary)}>{label}</span>
                            </div>
                            <span className="text-[8.5px] font-bold text-slate-400 shrink-0">
                              {format(start, 'HH:mm')}
                            </span>
                          </div>
                          
                          {/* Dog name */}
                           <div className="text-[10px] font-black text-slate-100 truncate my-auto min-w-0 leading-tight">
                             {dogNames[booking.dog_id] || allDogs.find(d => d.id === booking.dog_id)?.name || "Sconosciuto"}
                           </div>

                          {/* Customer details (only for >30m) */}
                          {durationMins > 30 && (
                            <div className="text-[8.5px] text-slate-400 font-bold truncate flex items-center gap-1 shrink-0 mt-0.5">
                              <User className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="truncate">{customerNames[booking.customer_id] || "Cliente"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Column Render: SETTIMANA (Giorni Settimana) */}
            {viewMode === "settimana" && weekDays.map((day, idx) => {
              const isToday = isSameDay(day, new Date());
              const isActiveDay = isSameDay(day, selectedDate);
              const dayBookings = weeklyBookings.filter(b => isSameDay(parseISO(b.start_time), day));

              return (
                 <div key={idx} className={cn("flex-1 border-r border-slate-800/60 relative min-w-0 group/col flex flex-col h-full")}>
                  <div className={cn(
                    "h-12 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md sticky top-0 z-10 flex flex-col justify-center items-center py-2 text-center shadow-sm shrink-0",
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

                  <div className="relative bg-slate-950 flex-1 min-h-[300px]">
                    {/* Background slots grid */}
                    <div className="absolute inset-0 flex flex-col">
                      {Array.from({ length: (endHour - startHour) * 2 }).map((_, i) => {
                        const isHourLine = i % 2 === 0;
                        const time = addMinutes(new Date(day).setHours(startHour, 0, 0, 0), i * 30);
                        return (
                          <div 
                            key={i} 
                            className={cn(
                              "transition-colors cursor-pointer relative group/cell flex-1 flex items-center justify-center min-h-[15px]",
                              isHourLine ? "border-b border-slate-800/40" : "border-b border-dashed border-slate-800/25",
                              "hover:bg-slate-900/30"
                            )}
                            onClick={() => {
                              setSelectedSlot({ stationId: "", time });
                              setSelectedCustomerId("");
                              setSelectedDogId("");
                              setSelectedBookingId("");
                            }}
                          >
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity bg-cyan-500/[0.03]">
                              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 text-cyan-400 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-lg">
                                <Plus className="w-3.5 h-3.5" />
                                <span>{format(time, 'HH:mm')}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* CURRENT TIME LINE WITHIN COLUMN (ONLY TODAY) */}
                    {isToday && isSameDay(day, currentTime) && currentTimePercent > 0 && currentTimePercent < 100 && (
                      <div 
                        className="absolute left-0 right-0 h-[2px] bg-rose-500/80 z-20 pointer-events-none -translate-y-1/2"
                        style={{ top: `${currentTimePercent}%` }}
                      />
                    )}

                    {/* Booking cards in week day column */}
                    {dayBookings.map(booking => {
                      const start = parseISO(booking.start_time);
                      const end = parseISO(booking.end_time);
                      
                      // Clamp to active hours range
                      const startMins = Math.max(0, (start.getHours() * 60 + start.getMinutes()) - (startHour * 60));
                      const endMins = Math.min(totalMinutes, (end.getHours() * 60 + end.getMinutes()) - (startHour * 60));
                      const durationMins = Math.max(15, endMins - startMins);
                      
                      const topPercent = (startMins / totalMinutes) * 100;
                      const heightPercent = (durationMins / totalMinutes) * 100;

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

                      const stName = stations.find(s => s.id === booking.station_id)?.name || "Postazione";

                      return (
                        <div
                          key={booking.id}
                          className={cn(
                            "absolute left-1 right-1 rounded-xl border flex flex-row overflow-hidden p-0 transition-all duration-300 hover:ring-2 hover:ring-white/10 hover:shadow-2xl hover:z-10 cursor-pointer active:scale-[0.98]",
                            bgColors
                          )}
                          style={{ top: `calc(${topPercent}% + 2px)`, height: `calc(${heightPercent}% - 4px)` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSlot({ stationId: booking.station_id, time: start });
                            setSelectedCustomerId(booking.customer_id);
                            setSelectedDogId(booking.dog_id);
                            setSelectedBookingId(booking.id);
                            setModalDuration(durationMins);
                          }}
                        >
                          <div className={cn("w-1 shrink-0 bg-gradient-to-b", accentColor)} />
                          <div className="flex-1 flex flex-col p-1 min-w-0 justify-between h-full overflow-hidden">
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-0.5 w-full min-w-0 shrink-0">
                              <span className="text-[8px] font-extrabold text-slate-350 truncate">{stName}</span>
                              <span className="text-[8px] font-bold text-slate-400 shrink-0">{format(start, 'HH:mm')}</span>
                            </div>

                            {/* Dog name */}
                            <div className="text-[9.5px] font-black text-slate-100 truncate my-auto min-w-0 leading-tight">
                              {dogNames[booking.dog_id] || allDogs.find(d => d.id === booking.dog_id)?.name || "Cane"}
                            </div>

                            {/* Customer details (only for >30m) */}
                            {durationMins > 30 && (
                              <div className="text-[8px] text-slate-400 font-bold truncate flex items-center gap-1 shrink-0 mt-0.5">
                                <User className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                <span className="truncate">{customerNames[booking.customer_id] || "Cliente"}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          </div>
        )}

        {/* ────────────────── VIEW MODE: MESE ────────────────── */}
        {viewMode === "mese" && (
          <div className="flex-1 flex flex-col min-w-[800px] bg-slate-950 p-2 animate-in fade-in duration-300">
            {/* Days grid headers */}
            <div className="grid grid-cols-7 gap-1 border-b border-slate-800/60 pb-2 bg-slate-950">
              {["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"].map((d) => (
                <div key={d} className="text-center text-[10px] font-extrabold uppercase tracking-widest text-slate-500 py-1">
                  {d}
                </div>
              ))}
            </div>
            
            {/* 6 Weeks Month Grid */}
            <div className="grid grid-cols-7 grid-rows-6 gap-[1px] bg-slate-800/30 flex-1 min-h-[520px] mt-1 rounded-xl overflow-hidden border border-slate-800/60">
              {monthDays.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const isActive = isSameDay(day, selectedDate);
                const dayBookings = monthlyBookings.filter(b => isSameDay(parseISO(b.start_time), day));

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      const time = new Date(day);
                      time.setHours(9, 0, 0, 0); // Default to 9:00 AM on slot click
                      setSelectedSlot({ stationId: "", time });
                      setSelectedCustomerId("");
                      setSelectedDogId("");
                      setSelectedBookingId("");
                    }}
                    className={cn(
                      "bg-slate-950 p-2 flex flex-col justify-between hover:bg-slate-900/30 transition-colors cursor-pointer border border-slate-900/40 relative group min-h-[90px]",
                      !isCurrentMonth && "opacity-30 bg-slate-950/40"
                    )}
                  >
                    {/* Header: day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn(
                        "text-xs font-black w-6 h-6 flex items-center justify-center rounded-full leading-none",
                        isToday 
                          ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" 
                          : isActive 
                            ? "bg-slate-800 text-slate-200" 
                            : "text-slate-400 group-hover:text-slate-200"
                      )}>
                        {format(day, "d")}
                      </span>
                      {dayBookings.length > 0 && (
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800/60">
                          {dayBookings.length}
                        </span>
                      )}
                    </div>

                    {/* Bookings inside day cell */}
                    <div className="flex-1 space-y-1 overflow-hidden mt-1">
                      {dayBookings.slice(0, 3).map(booking => {
                        const start = parseISO(booking.start_time);
                        let labelColor = "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:border-cyan-400";
                        if (booking.service_type === "ASSISTED_WASH") {
                          labelColor = "bg-blue-500/10 border-blue-500/30 text-blue-300 hover:border-blue-400";
                        } else if (booking.service_type === "FULL_GROOMING") {
                          labelColor = "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300 hover:border-fuchsia-400";
                        }

                        return (
                          <div
                            key={booking.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSlot({ stationId: booking.station_id, time: start });
                              setSelectedCustomerId(booking.customer_id);
                              setSelectedDogId(booking.dog_id);
                              setSelectedBookingId(booking.id);
                              setModalDuration(differenceInMinutes(parseISO(booking.end_time), start));
                            }}
                            className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded border truncate transition-all active:scale-[0.97]",
                              labelColor
                            )}
                          >
                            {format(start, 'HH:mm')} {dogNames[booking.dog_id] || allDogs.find(d => d.id === booking.dog_id)?.name || "Cane"}
                          </div>
                        );
                      })}
                      {dayBookings.length > 3 && (
                        <div className="text-[8px] text-slate-500 font-bold pl-1.5">
                          + {dayBookings.length - 3} altri...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* 4. ADMIN BOOKING MODAL */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-slate-200">
                {selectedBooking ? "Dettagli Prenotazione" : "Nuova Prenotazione (Bypass Admin)"}
              </h3>
              <button onClick={() => setSelectedSlot(null)} className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {selectedBooking ? (
              /* DETAIL / ACTION MODE */
              <div className="p-5 space-y-4">
                <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/60 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800/40 pb-2">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Stato</span>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      selectedBooking.status === "CONFIRMED" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                      selectedBooking.status === "PENDING" ? "bg-amber-500/10 border-amber-500/30 text-amber-300" :
                      selectedBooking.status === "COMPLETED" ? "bg-blue-500/10 border-blue-500/30 text-blue-300" :
                      "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    )}>
                      {selectedBooking.status === "CONFIRMED" ? "Confermata" :
                       selectedBooking.status === "PENDING" ? "In attesa" :
                       selectedBooking.status === "COMPLETED" ? "Completata" : "Annullata"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Postazione</span>
                    <span className="text-sm font-bold text-slate-200">
                      {stations.find(s => s.id === selectedBooking.station_id)?.name || "Postazione"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Data e Ora</span>
                    <span className="text-sm font-bold text-slate-200">
                      {format(parseISO(selectedBooking.start_time), 'dd MMMM yyyy', { locale: it })} · {format(parseISO(selectedBooking.start_time), 'HH:mm')} - {format(parseISO(selectedBooking.end_time), 'HH:mm')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Servizio</span>
                    <span className="text-sm font-bold text-slate-200">
                      {selectedBooking.service_type === "SELF_SERVICE" ? "Self Service" :
                       selectedBooking.service_type === "ASSISTED_WASH" ? "Lavaggio Assistito" : "Toelettatura Completa"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Cliente</span>
                    <span className="text-sm font-bold text-slate-200">
                      {customerNames[selectedBooking.customer_id] || 
                       (allProfiles.find(p => p.id === selectedBooking.customer_id) 
                         ? [allProfiles.find(p => p.id === selectedBooking.customer_id)?.first_name, allProfiles.find(p => p.id === selectedBooking.customer_id)?.last_name].filter(Boolean).join(" ") || allProfiles.find(p => p.id === selectedBooking.customer_id)?.email
                         : "Cliente")}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Cane</span>
                    <span className="text-sm font-bold text-slate-200">
                      {dogNames[selectedBooking.dog_id] || allDogs.find(d => d.id === selectedBooking.dog_id)?.name || "Cane"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {/* Cancel / Confirm / Complete buttons based on status */}
                  {selectedBooking.status === "PENDING" && (
                    <Button 
                      type="button" 
                      onClick={() => handleUpdateStatus("CONFIRMED")}
                      disabled={isPending}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2.5 font-bold transition-all text-xs"
                    >
                      Conferma Prenotazione
                    </Button>
                  )}
                  
                  {(selectedBooking.status === "PENDING" || selectedBooking.status === "CONFIRMED") && (
                    <>
                      <Button 
                        type="button" 
                        onClick={() => handleUpdateStatus("COMPLETED")}
                        disabled={isPending}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 font-bold transition-all text-xs"
                      >
                        Segna come Completata
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => handleUpdateStatus("CANCELLED")}
                        disabled={isPending}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 font-bold transition-all text-xs"
                      >
                        Annulla Prenotazione
                      </Button>
                    </>
                  )}

                  {selectedBooking.status === "CANCELLED" && (
                    <p className="text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 py-2.5 rounded-xl font-bold">
                      Questa prenotazione è stata annullata.
                    </p>
                  )}

                  {selectedBooking.status === "COMPLETED" && (
                    <p className="text-center text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 py-2.5 rounded-xl font-bold">
                      Questa prenotazione è stata completata con successo.
                    </p>
                  )}

                  <p className="text-[10px] text-center text-slate-500 leading-relaxed pt-2">
                    Per modificare l&apos;orario, il giorno o la postazione di questa prenotazione, annulla la prenotazione corrente e creane una nuova.
                  </p>
                </div>
              </div>
            ) : (
              /* CREATE MODE */
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
                    onChange={(e) => handleCustomerChange(e.target.value)}
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
                    <select 
                      name="dog_id" 
                      required 
                      className="w-full h-11 rounded-xl bg-slate-950 border border-slate-800 px-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                      value={selectedDogId}
                      onChange={(e) => setSelectedDogId(e.target.value)}
                    >
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
            )}
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
