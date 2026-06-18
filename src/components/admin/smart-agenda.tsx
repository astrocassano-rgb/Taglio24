"use client";

import React, { useMemo, useState } from "react";
import { format, parseISO, startOfDay, addMinutes, isSameDay, differenceInMinutes } from "date-fns";
import { it } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { PawPrint, Sparkles, AlertTriangle, Search, Plus, Calendar as CalendarIcon, Clock, User, Scissors, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { createAdminBooking } from "@/app/(admin)/admin/prenotazioni/actions";

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

const START_HOUR = 7;
const END_HOUR = 21;
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
  const selectedDate = useMemo(() => selectedDateStr ? parseISO(selectedDateStr) : new Date(), [selectedDateStr]);
  const [selectedSlot, setSelectedSlot] = useState<{ stationId: string; time: Date } | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  const customerDogs = useMemo(() => {
    return allDogs.filter(d => d.customer_id === selectedCustomerId);
  }, [allDogs, selectedCustomerId]);

  async function handleCreate(formData: FormData) {
    try {
      setIsPending(true);
      await createAdminBooking(formData);
      setSelectedSlot(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsPending(false);
    }
  }
  
  // Calculate total slots
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const numSlots = totalMinutes / SLOT_MINUTES;

  // Filter bookings for the selected day
  const dailyBookings = useMemo(() => {
    return bookings.filter(b => {
      const bDate = parseISO(b.start_time);
      return isSameDay(bDate, selectedDate) && b.status !== 'CANCELLED';
    });
  }, [bookings, selectedDate]);

  // Calculate groomer load per 30 min slot
  const groomerLoad = useMemo(() => {
    const load = new Array(numSlots).fill(0);
    const baseDate = new Date(selectedDate);
    baseDate.setHours(START_HOUR, 0, 0, 0);

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
  }, [dailyBookings, numSlots, selectedDate]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      
      {/* HEADER: Groomer Load Indicator */}
      <div className="bg-slate-900 border-b border-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> Carico Operatori ({maxConcurrentAssisted} max)
        </h3>
        <div className="flex w-full h-8 rounded-lg overflow-hidden border border-slate-800">
          {groomerLoad.map((load, i) => {
            const isOverloaded = load > maxConcurrentAssisted;
            const isFull = load === maxConcurrentAssisted;
            const isEmpty = load === 0;
            return (
              <div 
                key={i} 
                className={cn(
                  "flex-1 border-r border-slate-800/50 last:border-r-0 transition-colors relative group",
                  isEmpty ? "bg-slate-800/20" : isOverloaded ? "bg-red-500/80" : isFull ? "bg-amber-500/80" : "bg-emerald-500/60"
                )}
              >
                {/* Tooltip */}
                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-50">
                  {format(addMinutes(new Date().setHours(START_HOUR, 0, 0, 0), i * SLOT_MINUTES), 'HH:mm')} - {load} prenotazioni assistite
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CALENDAR GRID */}
      <div className="flex-1 overflow-auto relative">
        <div className="min-w-[800px] flex">
          
          {/* Time Column */}
          <div className="w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 sticky left-0 z-20">
            <div className="h-12 border-b border-slate-800 bg-slate-900 sticky top-0 z-30" />
            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
              <div key={i} className="h-24 border-b border-slate-800/50 relative">
                <span className="absolute -top-3 left-2 text-xs font-medium text-slate-500 bg-slate-900/50 px-1">
                  {String(START_HOUR + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Stations Columns */}
          {stations.map(station => (
            <div key={station.id} className="flex-1 border-r border-slate-800/50 relative min-w-[200px]">
              {/* Station Header */}
              <div className="h-12 border-b border-slate-800 bg-slate-900 sticky top-0 z-20 flex flex-col justify-center items-center px-2 text-center">
                <p className="text-sm font-semibold text-slate-200 truncate w-full">{station.name}</p>
                <p className="text-[10px] text-slate-500 uppercase">{station.type}</p>
              </div>

              {/* Grid Background */}
              <div className="relative" style={{ height: `${(END_HOUR - START_HOUR) * 96}px` }}>
                {Array.from({ length: (END_HOUR - START_HOUR) * 2 }).map((_, i) => (
                  <div 
                    key={i} 
                    className="h-12 border-b border-slate-800/20 hover:bg-slate-800/10 transition-colors cursor-pointer relative group"
                    onClick={() => {
                      const time = addMinutes(new Date(selectedDate).setHours(START_HOUR, 0, 0, 0), i * 30);
                      setSelectedSlot({ stationId: station.id, time });
                    }}
                  >
                    <div className="absolute inset-0 items-center justify-center hidden group-hover:flex">
                      <Plus className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                ))}

                {/* Bookings */}
                {dailyBookings.filter(b => b.station_id === station.id).map(booking => {
                  const start = parseISO(booking.start_time);
                  const end = parseISO(booking.end_time);
                  
                  const startTotalMinutes = (start.getHours() * 60 + start.getMinutes()) - (START_HOUR * 60);
                  const durationMins = differenceInMinutes(end, start);
                  
                  // 1 hour = 96px (24px per 15 min, 48px per 30 min)
                  // 1 minute = 96/60 = 1.6px
                  const top = startTotalMinutes * 1.6;
                  const height = durationMins * 1.6;

                  let bgColor = "bg-cyan-500/20 border-cyan-500/50";
                  let textColor = "text-cyan-200";
                  let Icon = PawPrint;
                  let label = "Self-Service";

                  if (booking.service_type === "ASSISTED_WASH") {
                    bgColor = "bg-blue-500/20 border-blue-500/50";
                    textColor = "text-blue-200";
                    Icon = Sparkles;
                    label = "Assistito";
                  } else if (booking.service_type === "FULL_GROOMING") {
                    bgColor = "bg-fuchsia-500/20 border-fuchsia-500/50";
                    textColor = "text-fuchsia-200";
                    Icon = Scissors;
                    label = "Grooming";
                  }

                  return (
                    <div
                      key={booking.id}
                      className={cn(
                        "absolute left-1 right-1 rounded-lg border shadow-lg overflow-hidden flex flex-col p-1.5 transition-all hover:ring-2 hover:ring-white/20 hover:z-10",
                        bgColor
                      )}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1">
                          <Icon className={cn("w-3 h-3 shrink-0", textColor)} />
                          <span className={cn("text-[10px] font-bold uppercase truncate", textColor)}>{label}</span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-300">
                          {format(start, 'HH:mm')}
                        </span>
                      </div>
                      
                      {height >= 48 && (
                        <>
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {dogNames[booking.dog_id] || "Cane sconosciuto"}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {customerNames[booking.customer_id] || "Cliente"}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ADMIN BOOKING MODAL */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="font-semibold text-slate-200">Nuova Prenotazione (Admin Bypass)</h3>
              <button onClick={() => setSelectedSlot(null)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form action={handleCreate} className="p-4 space-y-4">
              <input type="hidden" name="station_id" value={selectedSlot.stationId} />
              <input type="hidden" name="start_time" value={selectedSlot.time.toISOString()} />
              <input type="hidden" name="end_time" value={addMinutes(selectedSlot.time, SLOT_MINUTES).toISOString()} />
              
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-sm text-slate-300">
                <p><strong>Postazione:</strong> {stations.find(s => s.id === selectedSlot.stationId)?.name}</p>
                <p><strong>Orario:</strong> {format(selectedSlot.time, 'dd/MM/yyyy HH:mm')} - {format(addMinutes(selectedSlot.time, SLOT_MINUTES), 'HH:mm')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Cliente</label>
                <select 
                  name="customer_id" 
                  required 
                  className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200"
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">Cane</label>
                  <select name="dog_id" required className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200">
                    {customerDogs.length === 0 && <option value="">Nessun cane trovato</option>}
                    {customerDogs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Servizio</label>
                <select name="service_type" required className="w-full h-11 rounded-lg bg-slate-950 border border-slate-800 px-3 text-slate-200">
                  <option value="SELF_SERVICE">Self Service (Nessuna assistenza)</option>
                  <option value="ASSISTED_WASH">Lavaggio Assistito</option>
                  <option value="FULL_GROOMING">Toelettatura Completa</option>
                </select>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isPending || !selectedCustomerId || customerDogs.length === 0} className="w-full">
                  {isPending ? "Salvataggio..." : "Forza Prenotazione (0 crediti)"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
