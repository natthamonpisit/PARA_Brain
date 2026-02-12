import React, { useMemo } from 'react';
import { ParaItem, ParaType } from '../types';
import { AlertTriangle, CalendarClock, Link2Off, Clock3, ArrowRight } from 'lucide-react';

interface ReviewBoardProps {
  items: ParaItem[];
  onOpenItem: (id: string) => void;
}

interface ReviewSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: ParaItem[];
  emptyLabel: string;
  onOpenItem: (id: string) => void;
}

const ReviewSection: React.FC<ReviewSectionProps> = ({
  title,
  description,
  icon,
  items,
  emptyLabel,
  onOpenItem
}) => (
  <section className="bg-white border border-slate-200 rounded-2xl p-5">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
      <div className="p-2 rounded-lg bg-slate-50 text-slate-600">{icon}</div>
    </div>

    {items.length === 0 ? (
      <div className="text-sm text-slate-400 py-4">{emptyLabel}</div>
    ) : (
      <div className="space-y-2">
        {items.slice(0, 8).map(item => (
          <button
            key={item.id}
            onClick={() => onOpenItem(item.id)}
            className="w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
              <p className="text-[11px] text-slate-400 truncate">{item.category || 'No category'}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        ))}
        {items.length > 8 && (
          <div className="text-xs text-slate-400 pt-1">+ {items.length - 8} more</div>
        )}
      </div>
    )}
  </section>
);

export const ReviewBoard: React.FC<ReviewBoardProps> = ({ items, onOpenItem }) => {
  const now = useMemo(() => new Date(), []);

  const overdueTasks = useMemo(
    () =>
      items.filter(
        item =>
          item.type === ParaType.TASK &&
          !!item.dueDate &&
          !item.isCompleted &&
          new Date(item.dueDate as string).getTime() < now.getTime()
      ),
    [items, now]
  );

  const orphanTasks = useMemo(
    () =>
      items.filter(
        item =>
          item.type === ParaType.TASK &&
          !item.isCompleted &&
          (!item.relatedItemIds || item.relatedItemIds.length === 0) &&
          ['general', 'inbox', ''].includes((item.category || '').trim().toLowerCase())
      ),
    [items]
  );

  const staleProjects = useMemo(() => {
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 14);
    return items.filter(
      item =>
        item.type === ParaType.PROJECT &&
        item.status !== 'Completed' &&
        new Date(item.updatedAt).getTime() < staleThreshold.getTime()
    );
  }, [items]);

  const looseResources = useMemo(
    () =>
      items.filter(
        item =>
          item.type === ParaType.RESOURCE &&
          (!item.relatedItemIds || item.relatedItemIds.length === 0) &&
          ['general', 'inbox', ''].includes((item.category || '').trim().toLowerCase())
      ),
    [items]
  );

  return (
    <div className="pb-32 space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Weekly Review</h1>
        <p className="text-sm text-slate-500 mt-1">
          Clean inbox noise, rescue stalled work, and reconnect orphan notes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReviewSection
          title="Overdue Tasks"
          description="Tasks with due dates in the past and still incomplete."
          icon={<CalendarClock className="w-4 h-4" />}
          items={overdueTasks}
          emptyLabel="No overdue tasks."
          onOpenItem={onOpenItem}
        />
        <ReviewSection
          title="Orphan Tasks"
          description="Tasks not linked to a project/area and still in Inbox/General."
          icon={<Link2Off className="w-4 h-4" />}
          items={orphanTasks}
          emptyLabel="No orphan tasks."
          onOpenItem={onOpenItem}
        />
        <ReviewSection
          title="Stale Projects"
          description="Projects not updated in the last 14 days."
          icon={<Clock3 className="w-4 h-4" />}
          items={staleProjects}
          emptyLabel="No stale projects."
          onOpenItem={onOpenItem}
        />
        <ReviewSection
          title="Loose Resources"
          description="Resources without clear linkage to project/area."
          icon={<AlertTriangle className="w-4 h-4" />}
          items={looseResources}
          emptyLabel="No loose resources."
          onOpenItem={onOpenItem}
        />
      </div>
    </div>
  );
};
