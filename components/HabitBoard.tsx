
import React from 'react';
import { format, subDays, isSameDay } from 'date-fns';
import { ParaItem, ParaType } from '../types';
import { Check, Flame, XCircle } from 'lucide-react';

interface HabitBoardProps {
  items: ParaItem[];
}

export const HabitBoard: React.FC<HabitBoardProps> = ({ items }) => {
  // Logic: 
  // 1. Find all "Tasks" that have tag "Habit" or category "Habit".
  // 2. Group them by Title (e.g. "Read Book").
  // 3. Render a grid for last 14 days.

  const habitTasks = items.filter(i => 
    i.type === ParaType.TASK && 
    (i.tags.some(t => t.toLowerCase().includes('habit')) || i.category.toLowerCase().includes('habit'))
  );

  // Group by unique habit name
  const uniqueHabits = Array.from(new Set(habitTasks.map(h => h.title)));
  
  const daysToShow = 14;
  const dates = Array.from({ length: daysToShow }).map((_, i) => subDays(new Date(), daysToShow - 1 - i));

  if (uniqueHabits.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-400">
              <div className="p-4 bg-orange-50 rounded-full mb-4">
                  <Flame className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-700">No Habits Found</h3>
              <p className="text-sm mt-1">Tag a task with "Habit" to track it here.</p>
              <p className="text-xs text-slate-400 mt-2">Example: "Read 10 mins #habit"</p>
          </div>
      );
  }

  return (
    <div className="pb-32 animate-in fade-in duration-500">
        <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-100 rounded-lg">
                <Flame className="w-6 h-6 text-orange-600" />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Habit Tracker</h2>
                <p className="text-sm text-slate-500">Consistency is key. Track your streaks.</p>
            </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-4 text-left font-bold text-slate-700 w-48 sticky left-0 bg-slate-50 z-10 shadow-sm border-r border-slate-200">Habit</th>
                        <th className="px-2 py-4 text-center text-orange-500 font-bold w-16 bg-slate-50 z-10 border-r border-slate-200">Streak</th>
                        {dates.map(date => (
                            <th key={date.toISOString()} className="px-1 py-4 text-center min-w-[40px]">
                                <div className="text-[10px] text-slate-400 uppercase">{format(date, 'EEE')}</div>
                                <div className={`text-xs font-bold ${isSameDay(date, new Date()) ? 'text-indigo-600' : 'text-slate-700'}`}>
                                    {format(date, 'd')}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {uniqueHabits.map(habitTitle => {
                        // Calculate Streak (Simplified)
                        // Find completion for recent days
                        let currentStreak = 0;
                        const sortedCompletions = habitTasks
                            .filter(h => h.title === habitTitle && h.isCompleted)
                            .sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

                        // Simple logic: If completed today/yesterday, count backwards. 
                        // Real logic requires strict daily checking, but this is a visual proxy.
                        
                        return (
                            <tr key={habitTitle} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
                                    {habitTitle}
                                </td>
                                <td className="px-2 py-3 text-center border-r border-slate-100">
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                                        {sortedCompletions.length}
                                    </span>
                                </td>
                                {dates.map(date => {
                                    // Check if there is a task with this title completed on this date
                                    // Or created on this date and completed (more accurate for tasks)
                                    const isDone = habitTasks.some(h => 
                                        h.title === habitTitle && 
                                        h.isCompleted && 
                                        (
                                            isSameDay(new Date(h.updatedAt), date) || 
                                            // Fallback: If created that day and completed (for daily log logic)
                                            (isSameDay(new Date(h.createdAt), date) && h.isCompleted)
                                        )
                                    );

                                    return (
                                        <td key={date.toISOString()} className="px-1 py-3 text-center">
                                            {isDone ? (
                                                <div className="w-6 h-6 mx-auto bg-green-500 rounded flex items-center justify-center text-white shadow-sm">
                                                    <Check className="w-4 h-4" />
                                                </div>
                                            ) : (
                                                <div className="w-1.5 h-1.5 mx-auto bg-slate-200 rounded-full"></div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};
