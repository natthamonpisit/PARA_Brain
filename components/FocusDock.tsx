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
        .slice(0, 5),
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
    <section className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cyan-300" />
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Unified Focus Queue</p>
        </div>
        <button
          onClick={onGoTasks}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          Open Tasks
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-rose-200">
          {overdueCount} overdue
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
          {focusTasks.length} in focus now
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {focusTasks.length === 0 && (
          <p className="md:col-span-2 xl:col-span-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            No urgent task in queue.
          </p>
        )}
        {focusTasks.map((task) => {
          const overdue = !!task.dueDate && new Date(task.dueDate).getTime() < Date.now();
          return (
            <button
              key={task.id}
              onClick={() => onOpenItem(task.id)}
              className="rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 text-left hover:border-cyan-400/50"
            >
              <p className="line-clamp-1 text-sm font-semibold text-slate-100">{task.title}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-400">{task.category || 'Uncategorized'}</p>
              <div className="mt-2 flex items-center gap-1 text-xs">
                {overdue ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                    <span className="text-rose-300">Overdue</span>
                  </>
                ) : task.dueDate ? (
                  <>
                    <Clock3 className="h-3.5 w-3.5 text-amber-300" />
                    <span className="text-amber-300">{new Date(task.dueDate).toLocaleDateString()}</span>
                  </>
                ) : (
                  <span className="text-slate-500">No deadline</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
