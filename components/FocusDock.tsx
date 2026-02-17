import React, { useMemo } from 'react';
import { ParaItem, ParaType } from '../types';
import { AlertTriangle, ArrowRight, Clock3, Target } from 'lucide-react';

interface FocusDockProps {
  items: ParaItem[];
  onOpenItem: (id: string) => void;
  onGoTasks: () => void;
}

const rankTask = (item: ParaItem): number => {
  if (item.isCompleted) return -1;
  if ((item.tags || []).includes('triage-pending')) return 90;
  if (item.dueDate && new Date(item.dueDate).getTime() < Date.now()) return 100;
  if (item.dueDate) return 80;
  return 50;
};

export const FocusDock: React.FC<FocusDockProps> = ({ items, onOpenItem, onGoTasks }) => {
  const focusTasks = useMemo(
    () =>
      items
        .filter((i) => i.type === ParaType.TASK && !i.isCompleted)
        .sort((a, b) => {
          const rankGap = rankTask(b) - rankTask(a);
          if (rankGap !== 0) return rankGap;
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })
        .slice(0, 3),
    [items]
  );

  const overdueCount = useMemo(
    () =>
      items.filter(
        (i) => i.type === ParaType.TASK && !i.isCompleted && i.dueDate && new Date(i.dueDate).getTime() < Date.now()
      ).length,
    [items]
  );

  return (
    <section className="mb-3 rounded-xl border border-slate-700/80 bg-slate-900/70 p-2.5 md:p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-cyan-300" />
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Focus Queue</p>
          <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">
            {overdueCount} overdue
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
            {focusTasks.length} focus
          </span>
        </div>
        <button
          onClick={onGoTasks}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          All Tasks
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 grid gap-1.5 md:grid-cols-3">
        {focusTasks.length === 0 && (
          <p className="md:col-span-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
            No urgent task in queue.
          </p>
        )}
        {focusTasks.map((task) => {
          const overdue = !!task.dueDate && new Date(task.dueDate).getTime() < Date.now();
          return (
            <button
              key={task.id}
              onClick={() => onOpenItem(task.id)}
              className="rounded-lg border border-slate-700 bg-slate-900/95 p-2 text-left hover:border-cyan-400/50"
            >
              <p className="line-clamp-1 text-xs font-semibold text-slate-100">{task.title}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="line-clamp-1 text-[10px] text-slate-500">{task.category || 'Uncategorized'}</span>
                <div className="flex items-center gap-1 text-[10px]">
                  {overdue ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-rose-300" />
                      <span className="text-rose-300">Overdue</span>
                    </>
                  ) : task.dueDate ? (
                    <>
                      <Clock3 className="h-3 w-3 text-amber-300" />
                      <span className="text-amber-300">{new Date(task.dueDate).toLocaleDateString()}</span>
                    </>
                  ) : (
                    <span className="text-slate-600">No deadline</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
