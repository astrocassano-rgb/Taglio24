"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";

type StationLike = { id: string; name: string };
type AvailabilityInterval = { station_id: string; start_time: string; end_time: string };

export type WeekAvailabilitySelection = {
  dayKey: string;
  stationId: string;
  stationName: string;
  start: Date;
  end: Date;
  label: string;
  availableCount: number;
};

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

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function buildIntervalsByStation(availability: AvailabilityInterval[]) {
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
}

function computeSlotAvailability(args: {
  day: Date;
  stations: StationLike[];
  intervalsByStation: Map<string, { start: Date; end: Date }[]>;
  slotMinutes: number;
  durationMinutes: number;
  hours: { start: number; end: number };
}) {
  const { day, stations, intervalsByStation, slotMinutes, durationMinutes, hours } = args;
  const businessStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours.start, 0, 0, 0);
  const businessEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours.end, 0, 0, 0);
  const out: WeekAvailabilitySelection[] = [];

  const startSlotsCount = Math.max(
    0,
    Math.floor(((hours.end - hours.start) * 60 - durationMinutes) / slotMinutes) + 1
  );

  for (let i = 0; i < startSlotsCount; i++) {
    const start = addMinutes(businessStart, i * slotMinutes);
    const end = addMinutes(start, durationMinutes);
    if (end > businessEnd) continue;

    const freeStations: StationLike[] = [];
    for (const station of stations) {
      const intervals = intervalsByStation.get(station.id) ?? [];
      const occupied = intervals.some((it) => overlaps(start, end, it.start, it.end));
      if (!occupied) freeStations.push(station);
    }

    const first = freeStations[0];
    out.push({
      dayKey: ymd(day),
      stationId: first?.id ?? "",
      stationName: first?.name ?? "",
      start,
      end,
      label: hhmm(start),
      availableCount: freeStations.length
    });
  }

  return out;
}

export function WeekAvailabilityCalendar(props: {
  startDay: Date;
  stations: StationLike[];
  availability: AvailabilityInterval[];
  slotMinutes: number;
  durationMinutes: number;
  hours: { start: number; end: number };
  selected?: { dayKey: string; label: string } | null;
  onSelect?: (selection: WeekAvailabilitySelection) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}) {
  const { startDay, stations, availability, slotMinutes, durationMinutes, hours, selected, onSelect, onPrevWeek, onNextWeek } = props;

  const days = useMemo(() => {
    const base = startOfLocalDay(startDay);
    return Array.from({ length: 7 }, (_, i) => addDays(base, i));
  }, [startDay]);

  const intervalsByStation = useMemo(() => buildIntervalsByStation(availability), [availability]);

  const slotsByDayKey = useMemo(() => {
    const map = new Map<string, WeekAvailabilitySelection[]>();
    for (const day of days) {
      const key = ymd(day);
      map.set(
        key,
        computeSlotAvailability({
          day,
          stations,
          intervalsByStation,
          slotMinutes,
          durationMinutes,
          hours
        })
      );
    }
    return map;
  }, [days, durationMinutes, hours, intervalsByStation, slotMinutes, stations]);

  const timeRows = useMemo(() => {
    const rows: { label: string; minuteOfDay: number; showLabel: boolean }[] = [];
    const totalMinutes = (hours.end - hours.start) * 60;
    for (let minute = 0; minute <= totalMinutes; minute += slotMinutes) {
      const h = hours.start + Math.floor(minute / 60);
      const m = minute % 60;
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      rows.push({ label, minuteOfDay: minute, showLabel: m === 0 });
    }
    return rows;
  }, [hours.end, hours.start, slotMinutes]);

  return (
    <div className="rounded-3xl bg-slate-950/40 ring-1 ring-inset ring-slate-800">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-slate-200" />
          <div>
            <p className="text-sm font-semibold text-slate-50">Calendario disponibilità</p>
            <p className="text-xs text-slate-300">
              Slot {slotMinutes} min · durata {durationMinutes} min · {hours.start}:00–{hours.end}:00
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onPrevWeek ? (
            <Button type="button" variant="ghost" size="md" className="h-10 w-10 px-0" onClick={onPrevWeek}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          {onNextWeek ? (
            <Button type="button" variant="ghost" size="md" className="h-10 w-10 px-0" onClick={onNextWeek}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="md:hidden border-t border-slate-800">
        <div className="px-4 py-3">
          <div className="text-sm font-semibold text-slate-50">
            {days[0]?.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" }) ?? ""}
          </div>
          <div className="mt-1 text-xs text-slate-300">Tocca uno slot verde per selezionare l’orario.</div>
        </div>

        <div className="max-h-[420px] overflow-auto border-t border-slate-900">
          {timeRows.map((row) => {
            const focusDay = days[0];
            const key = focusDay ? ymd(focusDay) : "";
            const slots = key ? slotsByDayKey.get(key) ?? [] : [];
            const cell = slots.find((s) => s.label === row.label) ?? null;
            const isSelected = Boolean(cell && selected && selected.dayKey === cell.dayKey && selected.label === cell.label);
            const isFree = Boolean(cell && cell.availableCount > 0);
            const disabled = !isFree || !onSelect;

            return (
              <button
                key={`m-${row.minuteOfDay}`}
                type="button"
                disabled={disabled}
                className={
                  "flex w-full items-center justify-between gap-3 border-b border-slate-900 px-4 py-3 text-left " +
                  (isSelected
                    ? "bg-blue-500/20"
                    : isFree
                      ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "bg-slate-950/20")
                }
                onClick={() => {
                  if (!cell || !onSelect) return;
                  if (!cell.availableCount) return;
                  onSelect(cell);
                }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-50">{row.label}</span>
                  {row.showLabel ? <span className="text-xs text-slate-400">ora</span> : null}
                </div>
                <div className="text-xs text-slate-300">
                  {isFree ? `${cell?.availableCount ?? 0} libere` : "Occupato"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden md:block overflow-auto">
        <div className="min-w-[860px]">
          <div
            className="grid sticky top-0 z-10 bg-slate-950/95 backdrop-blur"
            style={{ gridTemplateColumns: `72px repeat(7, minmax(110px, 1fr))` }}
          >
            <div className="border-b border-slate-800 px-2 py-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Ora</div>
            {days.map((day) => {
              const key = ymd(day);
              const labelWeekday = day.toLocaleDateString("it-IT", { weekday: "short" });
              const labelDay = String(day.getDate()).padStart(2, "0");
              const labelMonth = day.toLocaleDateString("it-IT", { month: "short" });
              const isSelectedDay = selected?.dayKey === key;
              return (
                <div key={key} className="border-b border-slate-800 px-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-300">{labelWeekday}</div>
                    {isSelectedDay ? <div className="h-2 w-2 rounded-full bg-blue-400" /> : null}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-base font-semibold text-slate-50">{labelDay}</span>
                    <span className="text-[11px] text-slate-300">{labelMonth}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: `72px repeat(7, minmax(110px, 1fr))`,
              gridAutoRows: "28px"
            }}
          >
            {timeRows.map((row) => {
              return (
                <div key={`t-${row.minuteOfDay}`} className="contents">
                  <div className="border-b border-slate-900 px-2 py-1 text-xs text-slate-400">
                    {row.showLabel ? row.label : ""}
                  </div>

                  {days.map((day) => {
                    const key = ymd(day);
                    const slots = slotsByDayKey.get(key) ?? [];
                    const cell = slots.find((s) => s.label === row.label) ?? null;

                    const isSelected = Boolean(cell && selected && selected.dayKey === cell.dayKey && selected.label === cell.label);
                    const isFree = Boolean(cell && cell.availableCount > 0);
                    const disabled = !isFree || !onSelect;

                    const className =
                      "border-b border-slate-900 px-1 " +
                      (isSelected
                        ? "bg-blue-500/20"
                        : isFree
                          ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                          : "bg-slate-950/20");

                    return (
                      <button
                        key={`${key}-${row.label}`}
                        type="button"
                        disabled={disabled}
                        className={className}
                        title={
                          cell
                            ? cell.availableCount > 0
                              ? `${cell.availableCount} postazioni libere`
                              : "Occupato"
                            : "Fuori orario"
                        }
                        onClick={() => {
                          if (!cell || !onSelect) return;
                          if (!cell.availableCount) return;
                          onSelect(cell);
                        }}
                      >
                        {isFree ? (
                          <div className="flex h-full items-center justify-center text-[11px] font-medium text-emerald-200">
                            {cell?.availableCount ?? ""}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
