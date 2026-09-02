import React, { useState } from 'react';
import { useStore } from '../store';
import { ChevronLeft, ChevronRight, Music, Calendar as CalendarIcon } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { Gig, DanceEvent } from '../types';

export function Agenda() {
  const { data } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, (_, i) => i); // Mon as first day

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const gigs = data.gigs.filter(g => g.fecha === dateStr);
    const events = data.events.filter(e => e.date === dateStr);
    return { gigs, events };
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-magenta" />
            Agenda
          </h1>
          <p className="text-ink-muted mt-1">Calendario de contratos y eventos</p>
        </div>
      </div>

      <div className="card p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-magenta capitalize">{monthNames[month]} {year}</h2>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-surface rounded-lg border border-ink-muted/20"><ChevronLeft className="w-5 h-5"/></button>
            <button onClick={nextMonth} className="p-2 hover:bg-surface rounded-lg border border-ink-muted/20"><ChevronRight className="w-5 h-5"/></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-ink-muted/20 rounded-xl overflow-hidden flex-1 border border-ink-muted/20">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
            <div key={day} className="bg-surface p-2 text-center font-semibold text-sm text-ink-muted">
              {day}
            </div>
          ))}
          
          {blanks.map(blank => (
            <div key={`blank-${blank}`} className="bg-bg/50 min-h-[100px] p-2"></div>
          ))}
          
          {days.map(day => {
            const { gigs, events } = getEventsForDay(day);
            const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
            
            return (
              <div key={day} className={cn("bg-bg min-h-[120px] p-2 border-t border-ink-muted/10 relative group transition-colors hover:bg-surface", isToday && "bg-magenta/5")}>
                <span className={cn("text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1", isToday ? "bg-magenta text-white" : "text-ink-muted group-hover:text-ink")}>
                  {day}
                </span>
                
                <div className="space-y-1 overflow-y-auto max-h-[120px] scrollbar-hide">
                  {gigs.map(g => (
                    <div key={g.id} className="text-xs p-1.5 rounded bg-accent-dj/10 border border-accent-dj/20 text-accent-dj cursor-pointer hover:bg-accent-dj/20 transition-colors" title={`${g.evento} - ${g.hora}`}>
                      <div className="font-semibold truncate">{g.evento}</div>
                      <div className="text-[10px] opacity-80">{g.hora}</div>
                    </div>
                  ))}
                  {events.map(e => (
                    <div key={e.id} className="text-xs p-1.5 rounded bg-success/10 border border-success/20 text-success cursor-pointer hover:bg-success/20 transition-colors" title={`${e.title} - ${e.startTime}`}>
                      <div className="font-semibold truncate">{e.title}</div>
                      <div className="text-[10px] opacity-80">{e.startTime}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
