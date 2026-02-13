import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Layers3, CheckCircle2, AlertTriangle, ArrowRight, Target } from 'lucide-react';
import { ParaItem, ParaType } from '../types';

interface AreaProjectStats {
  project: ParaItem;
  tasks: ParaItem[];
  taskCount: number;
  completedCount: number;
  completionRate: number;
}

interface AreaStats {
  area: ParaItem;
  projects: ParaItem[];
  tasks: ParaItem[];
  openTaskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  completionRate: number;
  loadScore: number;
  projectStats: AreaProjectStats[];
}

interface LifeOverviewBoardProps {
  items: ParaItem[];
  onOpenItem: (id: string) => void;
}

const normalize = (value?: string): string => String(value || '').trim().toLowerCase();

const byRecency = (a: ParaItem, b: ParaItem): number => {
  const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bt - at;
};

const isTaskOverdue = (task: ParaItem): boolean => {
  if (task.type !== ParaType.TASK || task.isCompleted || !task.dueDate) return false;
  return new Date(task.dueDate).getTime() < Date.now();
};

const buildAreaStats = (items: ParaItem[]): AreaStats[] => {
  const areas = items.filter((item) => item.type === ParaType.AREA).sort(byRecency);
  const projects = items.filter((item) => item.type === ParaType.PROJECT);
  const tasks = items.filter((item) => item.type === ParaType.TASK);

  return areas
    .map((area) => {
      const areaId = area.id;
      const areaTitle = normalize(area.title);
      const areaCategory = normalize(area.category);

      const areaProjects = projects.filter((project) => {
        const linked = (project.relatedItemIds || []).includes(areaId);
        const categoryMatch = areaCategory && normalize(project.category) === areaCategory;
        const titleMatch = areaTitle && normalize(project.category) === areaTitle;
        return linked || categoryMatch || titleMatch;
      });

      const areaProjectIds = new Set(areaProjects.map((project) => project.id));

      const areaTasks = tasks.filter((task) => {
        const related = task.relatedItemIds || [];
        const linkedToProject = related.some((id) => areaProjectIds.has(id));
        const linkedToArea = related.includes(areaId);
        const categoryMatch = areaCategory && normalize(task.category) === areaCategory;
        const titleMatch = areaTitle && normalize(task.category) === areaTitle;
        return linkedToProject || linkedToArea || categoryMatch || titleMatch;
      });

      const openTaskCount = areaTasks.filter((task) => !task.isCompleted).length;
      const completedTaskCount = areaTasks.filter((task) => !!task.isCompleted).length;
      const overdueTaskCount = areaTasks.filter((task) => isTaskOverdue(task)).length;
      const completionRate = areaTasks.length > 0 ? Math.round((completedTaskCount / areaTasks.length) * 100) : 0;
      const loadScore = areaProjects.length + areaTasks.length;

      const projectStats: AreaProjectStats[] = areaProjects
        .map((project) => {
          const projectTasks = tasks.filter((task) => (task.relatedItemIds || []).includes(project.id));
          const completed = projectTasks.filter((task) => !!task.isCompleted).length;
          const completion = projectTasks.length > 0 ? Math.round((completed / projectTasks.length) * 100) : 0;
          return {
            project,
            tasks: projectTasks,
            taskCount: projectTasks.length,
            completedCount: completed,
            completionRate: completion
          };
        })
        .sort((a, b) => {
          const loadA = a.taskCount - a.completedCount;
          const loadB = b.taskCount - b.completedCount;
          if (loadB !== loadA) return loadB - loadA;
          return byRecency(a.project, b.project);
        });

      return {
        area,
        projects: areaProjects,
        tasks: areaTasks,
        openTaskCount,
        completedTaskCount,
        overdueTaskCount,
        completionRate,
        loadScore,
        projectStats
      };
    })
    .sort((a, b) => {
      if (b.loadScore !== a.loadScore) return b.loadScore - a.loadScore;
      if (b.openTaskCount !== a.openTaskCount) return b.openTaskCount - a.openTaskCount;
      return byRecency(a.area, b.area);
    });
};

const SmallAreaCard: React.FC<{
  stats: AreaStats;
  isActive: boolean;
  onSelect: () => void;
}> = ({ stats, isActive, onSelect }) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left transition-all ${
        isActive
          ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_10px_30px_rgba(34,211,238,0.12)]'
          : 'border-slate-700 bg-slate-900/85 hover:border-cyan-400/30 hover:bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-sm font-semibold text-slate-100">{stats.area.title}</p>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">Load {stats.loadScore}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-400">
        <span>{stats.projects.length} proj</span>
        <span>{stats.openTaskCount} open</span>
        <span>{stats.overdueTaskCount} overdue</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
          style={{ width: `${stats.completionRate}%` }}
        />
      </div>
    </button>
  );
};

export const LifeOverviewBoard: React.FC<LifeOverviewBoardProps> = ({ items, onOpenItem }) => {
  const rankedAreas = useMemo(() => buildAreaStats(items), [items]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (rankedAreas.length === 0) {
      setSelectedAreaId(null);
      return;
    }
    const exists = rankedAreas.some((entry) => entry.area.id === selectedAreaId);
    if (!selectedAreaId || !exists) {
      setSelectedAreaId(rankedAreas[0].area.id);
    }
  }, [rankedAreas, selectedAreaId]);

  const selected = useMemo(() => {
    if (rankedAreas.length === 0) return null;
    return rankedAreas.find((entry) => entry.area.id === selectedAreaId) || rankedAreas[0];
  }, [rankedAreas, selectedAreaId]);

  const others = useMemo(() => {
    if (!selected) return rankedAreas;
    return rankedAreas.filter((entry) => entry.area.id !== selected.area.id);
  }, [rankedAreas, selected]);

  const leftColumn = others.filter((_, idx) => idx % 2 === 0);
  const rightColumn = others.filter((_, idx) => idx % 2 === 1);

  if (rankedAreas.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 text-sm text-slate-300">
        ยังไม่มี Area ให้สรุปภาพรวมชีวิต ลองสร้าง Area ก่อน แล้ว Life Overview จะจัดลำดับ workload ให้อัตโนมัติ
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Life Overview</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Area Focus Radar</h1>
            <p className="mt-1 text-sm text-slate-400">
              Spotlight area ถูกเลือกจาก Project + Task มากที่สุด เพื่อให้เห็นด้านที่วุ่นวายที่สุดเร็วที่สุด
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-300">
            Areas tracked: <span className="font-semibold text-slate-100">{rankedAreas.length}</span>
          </div>
        </div>
      </section>

      <div className="hidden lg:grid lg:grid-cols-[260px_minmax(0,1fr)_260px] lg:gap-4">
        <div className="space-y-3">
          {leftColumn.map((entry) => (
            <SmallAreaCard
              key={entry.area.id}
              stats={entry}
              isActive={selected?.area.id === entry.area.id}
              onSelect={() => setSelectedAreaId(entry.area.id)}
            />
          ))}
        </div>

        {selected && (
          <section className="rounded-3xl border border-cyan-400/35 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-5 shadow-[0_20px_60px_rgba(14,116,144,0.2)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                  <Target className="h-3.5 w-3.5" />
                  Primary Focus Area
                </div>
                <h2 className="mt-2 text-2xl font-bold text-slate-100">{selected.area.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{selected.area.category || 'General'}</p>
              </div>
              <button
                onClick={() => onOpenItem(selected.area.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
              >
                Open Area
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] text-slate-500">Projects</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{selected.projects.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] text-slate-500">Tasks</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{selected.tasks.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] text-slate-500">Open</p>
                <p className="mt-1 text-xl font-semibold text-amber-200">{selected.openTaskCount}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3">
                <p className="text-[11px] text-slate-500">Overdue</p>
                <p className="mt-1 text-xl font-semibold text-rose-200">{selected.overdueTaskCount}</p>
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                style={{ width: `${selected.completionRate}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Area completion from tasks: {selected.completionRate}%</p>

            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                  <Layers3 className="h-4 w-4" />
                  Child Projects
                </h3>
                <span className="text-xs text-slate-400">{selected.projectStats.length} linked</span>
              </div>
              <div className="space-y-2">
                {selected.projectStats.length === 0 && (
                  <p className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400">
                    ยังไม่มี Project เชื่อมกับ Area นี้
                  </p>
                )}
                {selected.projectStats.map((projectStats) => (
                  <button
                    key={projectStats.project.id}
                    onClick={() => onOpenItem(projectStats.project.id)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-left hover:border-cyan-400/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-100">{projectStats.project.title}</p>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                        {projectStats.taskCount} tasks
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{projectStats.completedCount}/{projectStats.taskCount} complete</span>
                      <span className="text-slate-500">•</span>
                      <span>{projectStats.completionRate}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                        style={{ width: `${projectStats.completionRate}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="space-y-3">
          {rightColumn.map((entry) => (
            <SmallAreaCard
              key={entry.area.id}
              stats={entry}
              isActive={selected?.area.id === entry.area.id}
              onSelect={() => setSelectedAreaId(entry.area.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {selected && (
          <section className="rounded-2xl border border-cyan-400/35 bg-slate-900/85 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">Primary Focus</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">{selected.area.title}</h2>
              </div>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">Load {selected.loadScore}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200">{selected.projects.length} proj</div>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200">{selected.openTaskCount} open</div>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-rose-200">{selected.overdueTaskCount} overdue</div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${selected.completionRate}%` }} />
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
              <BarChart3 className="h-4 w-4" />
              Areas
            </h3>
            <span className="text-xs text-slate-400">Tap to spotlight</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {rankedAreas.map((entry) => (
              <SmallAreaCard
                key={entry.area.id}
                stats={entry}
                isActive={selected?.area.id === entry.area.id}
                onSelect={() => setSelectedAreaId(entry.area.id)}
              />
            ))}
          </div>
        </section>

        {selected && (
          <section className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
              <CheckCircle2 className="h-4 w-4" />
              Projects In Focus Area
            </h3>
            <div className="mt-2 space-y-2">
              {selected.projectStats.length === 0 && (
                <p className="text-xs text-slate-400">ยังไม่มี project เชื่อมใน area นี้</p>
              )}
              {selected.projectStats.map((projectStats) => (
                <button
                  key={projectStats.project.id}
                  onClick={() => onOpenItem(projectStats.project.id)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-100">{projectStats.project.title}</p>
                    {projectStats.completionRate >= 80 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    ) : projectStats.completionRate <= 30 && projectStats.taskCount > 0 ? (
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{projectStats.completedCount}/{projectStats.taskCount} complete</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${projectStats.completionRate}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
