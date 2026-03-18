import React from 'react';
import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  isToday 
} from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Schedule } from '../types';
import { cn } from '../lib/utils';

interface ScheduleCalendarProps {
  schedules: Schedule[];
  onScheduleClick: (schedule: Schedule) => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export default function ScheduleCalendar({ 
  schedules, 
  onScheduleClick, 
  currentDate, 
  onDateChange 
}: ScheduleCalendarProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start on Monday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "MMMM yyyy";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => onDateChange(addMonths(currentDate, 1));
  const prevMonth = () => onDateChange(subMonths(currentDate, 1));

  const weekDays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
        <h2 className="text-lg font-bold text-slate-800 capitalize">
          {format(currentDate, dateFormat, { locale: id })}
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={prevMonth}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={() => onDateChange(new Date())}
            className="px-3 py-1.5 text-sm font-medium hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
          >
            Hari Ini
          </button>
          <button 
            onClick={nextMonth}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekDays.map((day, i) => (
          <div key={i} className="py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
        {days.map((day, i) => {
          const daySchedules = schedules.filter(s => isSameDay(new Date(s.schedule_date), day));
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isCurrentDay = isToday(day);

          return (
            <div 
              key={day.toString()} 
              className={cn(
                "min-h-[120px] bg-white p-2 transition-colors",
                !isCurrentMonth && "bg-slate-50/50 text-slate-400",
                isCurrentDay && "bg-indigo-50/30"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium",
                  isCurrentDay ? "bg-indigo-600 text-white" : "text-slate-700",
                  !isCurrentMonth && !isCurrentDay && "text-slate-400"
                )}>
                  {format(day, 'd')}
                </span>
                {daySchedules.length > 0 && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                    {daySchedules.length}
                  </span>
                )}
              </div>
              
              <div className="space-y-1.5 overflow-y-auto max-h-[80px] custom-scrollbar pr-1">
                {daySchedules.map(schedule => (
                  <div 
                    key={schedule.id}
                    onClick={() => onScheduleClick(schedule)}
                    className={cn(
                      "text-xs p-1.5 rounded-md cursor-pointer truncate border transition-all hover:shadow-sm",
                      schedule.is_confirmed 
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:border-emerald-300" 
                        : "bg-amber-50 border-amber-100 text-amber-700 hover:border-amber-300"
                    )}
                    title={`${schedule.candidate?.full_name} - ${format(new Date(schedule.schedule_date), 'HH:mm')}`}
                  >
                    <div className="font-semibold truncate">{schedule.candidate?.full_name}</div>
                    <div className="flex items-center gap-1 opacity-80 mt-0.5">
                      <Clock size={10} />
                      <span>{format(new Date(schedule.schedule_date), 'HH:mm')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
