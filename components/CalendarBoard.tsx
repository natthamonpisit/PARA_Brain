
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ParaItem, ParaType } from '../types';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from 'lucide-react';

interface CalendarBoardProps {
  items: ParaItem[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onSelectItem: (id: string) => void;
}

export const CalendarBoard: React.FC<CalendarBoardProps> = ({ items, currentDate, onDateChange, onSelectItem }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filter items with dates
  const datedItems = items.filter(item => 
    (item.type === ParaType.TASK && item.dueDate) || 
    (item.type === ParaType.PROJECT && item.deadline)
  );

  const prevMonth = () => {
    onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <div className="pb-32 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => onDateChange(new Date())} className="px-3 py-1 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
            Today
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="bg-slate-50 p-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
        
        {/* Empty cells for start of month */}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white min-h-[100px]"></div>
        ))}

        {daysInMonth.map(day => {
           const dayItems = datedItems.filter(item => {
             const targetDate = item.dueDate || item.deadline;
             return targetDate && isSameDay(new Date(targetDate), day);
           });

           return (
             <div 
               key={day.toISOString()} 
               className={`bg-white min-h-[120px] p-2 transition-colors hover:bg-slate-50 ${isToday(day) ? 'bg-indigo-50/30' : ''}`}
             >
               <div className="flex justify-between items-start mb-1">
                 <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                   {format(day, 'd')}
                 </span>
                 {dayItems.length > 0 && <span className="text-[10px] text-slate-400 font-bold">{dayItems.length} items</span>}
               </div>

               <div className="space-y-1">
                 {dayItems.slice(0, 4).map(item => (
                   <button 
                      key={item.id} 
                      onClick={() => onSelectItem(item.id)}
                      className={`
                        w-full text-left px-1.5 py-1 rounded text-[10px] font-medium truncate flex items-center gap-1
                        ${item.type === ParaType.PROJECT 
                           ? 'bg-red-50 text-red-700 border border-red-100' 
                           : item.isCompleted 
                              ? 'bg-slate-100 text-slate-400 line-through' 
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}
                      `}
                   >
                      {item.type === ParaType.TASK && (
                        item.isCompleted ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> : <Circle className="w-2.5 h-2.5 shrink-0" />
                      )}
                      <span className="truncate">{item.title}</span>
                   </button>
                 ))}
                 {dayItems.length > 4 && (
                   <div className="text-[10px] text-slate-400 pl-1">+ {dayItems.length - 4} more</div>
                 )}
               </div>
             </div>
           );
        })}
      </div>
    </div>
  );
};
