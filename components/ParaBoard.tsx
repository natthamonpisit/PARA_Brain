
import React, { useMemo } from 'react';
import { ParaItem, ParaType, ViewMode } from '../types';
import { Tag, CheckSquare, Trash2, Target, Book, Layers, ArrowRight, Archive, Folder, Pencil, LayoutGrid } from 'lucide-react';
import { TaskCard, ParaCard } from './ParaCards';

interface ParaBoardProps {
  items: ParaItem[]; // displayed items (filtered)
  activeType: ParaType | 'All';
  viewMode: ViewMode;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void; 
  onToggleComplete?: (id: string, currentStatus: boolean) => void;
  onEdit?: (id: string) => void;
  onItemClick?: (id: string) => void;
  allItemsMap?: Record<string, ParaItem>; 
  allItems?: ParaItem[]; // Full list for finding relationships/children
  // Selection Props
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}

export const ParaBoard: React.FC<ParaBoardProps> = ({ 
    items, 
    activeType, 
    viewMode,
    onDelete,
    onArchive,
    onToggleComplete,
    onEdit,
    onItemClick,
    allItemsMap = {},
    allItems = [],
    selectedIds,
    onSelect,
    onSelectAll
}) => {
  
  // --- DASHBOARD VIEW (AREA HUB) ---
  if (activeType === 'All') {
      // Use 'allItems' for accurate dashboard stats if available, otherwise fallback to 'items'
      // Note: Dashboard usually needs full context.
      const sourceItems = allItems.length > 0 ? allItems : items;
      const areas = sourceItems.filter(i => i.type === ParaType.AREA);
      const unassignedItems = sourceItems.filter(i => i.type !== ParaType.AREA && !areas.some(a => a.title === i.category));

      // Recursive Counting Logic
      const areaStats = areas.map(area => {
          // 1. Direct Children
          const directChildren = sourceItems.filter(i => 
              (i.category === area.title || i.relatedItemIds?.includes(area.id)) && i.id !== area.id
          );

          // 2. Projects within Direct Children
          const childProjects = directChildren.filter(i => i.type === ParaType.PROJECT);

          // 3. Grandchildren: Find Tasks linked to those Projects
          const projectIds = childProjects.map(p => p.id);
          const grandchildTasks = sourceItems.filter(i => 
              i.type === ParaType.TASK && 
              i.relatedItemIds?.some(relId => projectIds.includes(relId)) &&
              !directChildren.includes(i) // Avoid double counting
          );

          // Merge Lists
          const allRelatedTasks = [...directChildren.filter(i => i.type === ParaType.TASK), ...grandchildTasks];
          const allRelatedResources = directChildren.filter(i => i.type === ParaType.RESOURCE);

          const activeProjects = childProjects.filter(p => p.status !== 'Completed').length;
          const pendingTasks = allRelatedTasks.filter(t => !t.isCompleted).length;
          
          const progress = allRelatedTasks.length > 0 ? Math.round((allRelatedTasks.filter(t => t.isCompleted).length / allRelatedTasks.length) * 100) : 0;

          return {
              area,
              stats: {
                  projects: activeProjects,
                  tasks: pendingTasks,
                  resources: allRelatedResources.length,
                  progress
              }
          };
      });

      return (
          <div className="pb-20 space-y-5 animate-in fade-in duration-500">
              <div className="flex flex-col gap-1 mb-4">
                  <h1 className="text-2xl font-bold text-slate-100">Life Dashboard</h1>
                  <p className="text-sm text-slate-400">Your areas of responsibility at a glance.</p>
              </div>

              {/* AREA CARDS GRID - Compact */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {areaStats.map(({ area, stats }) => (
                      <div
                        key={area.id}
                        onClick={() => onItemClick && onItemClick(area.id)}
                        className="group rounded-xl border border-slate-700/80 bg-slate-900/70 p-3.5 hover:border-cyan-400/40 transition-all duration-300 relative overflow-hidden cursor-pointer flex flex-col"
                      >
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-emerald-400"></div>

                          <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-1.5 bg-cyan-500/10 text-cyan-300 rounded-lg shrink-0">
                                     <Layers className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                     <h3 className="text-sm font-bold text-slate-100 leading-tight truncate">{area.title}</h3>
                                     <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Area</span>
                                  </div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  {onEdit && (
                                    <button onClick={(e) => { e.stopPropagation(); onEdit(area.id); }} className="text-slate-500 hover:text-cyan-300 p-0.5">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button onClick={(e) => { e.stopPropagation(); onDelete(area.id); }} className="text-slate-500 hover:text-rose-300 p-0.5">
                                      <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 mb-3 mt-auto">
                              <div className="bg-slate-900 rounded-md p-1.5 text-center border border-slate-700">
                                  <div className="flex items-center justify-center text-rose-300 mb-0.5">
                                      <Target className="w-3 h-3" />
                                  </div>
                                  <div className="text-sm font-bold text-slate-100 leading-none">{stats.projects}</div>
                                  <div className="text-[8px] text-slate-500 font-medium mt-0.5">Proj</div>
                              </div>
                              <div className="bg-slate-900 rounded-md p-1.5 text-center border border-slate-700">
                                  <div className="flex items-center justify-center text-emerald-300 mb-0.5">
                                      <CheckSquare className="w-3 h-3" />
                                  </div>
                                  <div className="text-sm font-bold text-slate-100 leading-none">{stats.tasks}</div>
                                  <div className="text-[8px] text-slate-500 font-medium mt-0.5">Tasks</div>
                              </div>
                              <div className="bg-slate-900 rounded-md p-1.5 text-center border border-slate-700">
                                  <div className="flex items-center justify-center text-cyan-300 mb-0.5">
                                      <Book className="w-3 h-3" />
                                  </div>
                                  <div className="text-sm font-bold text-slate-100 leading-none">{stats.resources}</div>
                                  <div className="text-[8px] text-slate-500 font-medium mt-0.5">Res</div>
                              </div>
                          </div>

                          <div className="space-y-1">
                              <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                                  <span>Completion</span>
                                  <span>{stats.progress}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${stats.progress}%` }}></div>
                              </div>
                          </div>
                      </div>
                  ))}

                  {areaStats.length === 0 && (
                      <div className="col-span-full py-10 text-center border-2 border-dashed border-slate-700 rounded-xl bg-slate-900/40">
                          <Layers className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                          <h3 className="text-slate-300 font-medium text-sm">No Areas Defined</h3>
                          <p className="text-xs text-slate-500 mt-1">Create an 'Area' (e.g., Health, Work) to see it here.</p>
                      </div>
                  )}
              </div>

              {unassignedItems.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-300"></div>
                          Unassigned / Inbox
                      </h4>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 opacity-80 hover:opacity-100 transition-opacity">
                          {unassignedItems.slice(0, 6).map(item => (
                              <div key={item.id} onClick={() => onItemClick && onItemClick(item.id)} className="bg-slate-900/70 border border-slate-700 rounded-lg p-2 flex items-center justify-between cursor-pointer hover:border-cyan-400/40 hover:bg-slate-900">
                                  <div className="min-w-0">
                                      <p className="font-medium text-slate-200 text-xs truncate">{item.title}</p>
                                      <p className="text-[10px] text-slate-500">{item.type} • {item.category}</p>
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      );
  }

  // --- HIERARCHY / TREE VIEW ---
  if (viewMode === 'HIERARCHY') {
      return (
          <HierarchyView 
              items={items} 
              onDelete={onDelete} 
              onArchive={onArchive} 
              onToggleComplete={onToggleComplete}
              onItemClick={onItemClick}
          />
      );
  }

  // --- STANDARD FILTERED LIST VIEWS ---
  const displayItems = items.filter(i => i.type === activeType);

  // Sorting
  const sortedItems = [...displayItems].sort((a, b) => {
    if (a.type === ParaType.TASK && b.type === ParaType.TASK) {
        if (a.isCompleted === b.isCompleted) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.isCompleted ? 1 : -1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Grouping
  const groupedItems = sortedItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ParaItem[]>);

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
          <Tag className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-lg font-medium text-slate-300">No {activeType} items yet</p>
        <p className="text-sm text-slate-500">Create your first item to get started.</p>
      </div>
    );
  }

  // --- RENDER TABLE VIEW (FLAT LIST) ---
  if (viewMode === 'TABLE') {
      return (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 overflow-hidden shadow-sm animate-in fade-in">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm text-left">
                  <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-700">
                      <tr>
                          <th className="px-4 py-3 w-10">
                              <input 
                                type="checkbox" 
                                checked={displayItems.length > 0 && selectedIds.size === displayItems.length}
                                onChange={() => onSelectAll(displayItems.map(i => i.id))}
                                className="rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                              />
                          </th>
                          <th className="px-4 py-3">Title</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                      {sortedItems.map(item => (
                          <tr key={item.id} onClick={() => onItemClick && onItemClick(item.id)} className={`hover:bg-slate-800/60 transition-colors cursor-pointer ${selectedIds.has(item.id) ? 'bg-cyan-500/10' : ''}`}>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => onSelect(item.id)}
                                    className="rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                  />
                              </td>
                              <td className="px-4 py-3">
                                  <div className={`font-medium ${item.isCompleted ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                      {item.title}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate max-w-xs">{item.content}</div>
                              </td>
                              <td className="px-4 py-3">
                                  <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-xs">{item.category}</span>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{item.type}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{new Date(item.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  {item.type === ParaType.TASK && (
                                      <button onClick={() => onToggleComplete && onToggleComplete(item.id, !!item.isCompleted)} className={item.isCompleted ? 'text-emerald-300' : 'text-slate-500 hover:text-emerald-300'}>
                                          <CheckSquare className="w-4 h-4" />
                                      </button>
                                  )}
                                  {onEdit && (
                                    <button onClick={() => onEdit(item.id)} className="text-slate-500 hover:text-cyan-300" title="Edit">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                  )}
                                  {item.type !== ParaType.ARCHIVE && (
                                    <button onClick={() => onArchive(item.id)} className="text-slate-500 hover:text-slate-200" title="Archive">
                                        <Archive className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button onClick={() => onDelete(item.id)} className="text-slate-500 hover:text-rose-300">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
              </div>
          </div>
      );
  }

  // --- RENDER GRID / LIST VIEW (GROUPED) ---
  return (
    <div className="pb-20 space-y-5">
      {Object.entries(groupedItems).map(([category, categoryItems]: [string, ParaItem[]]) => (
        <div key={category} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-lg font-bold text-slate-100">{category}</h2>
            <div className="h-px flex-1 bg-slate-700"></div>
            <span className="text-[10px] font-medium text-slate-500">{categoryItems.length} items</span>
          </div>

          <div className={`grid gap-2.5 ${
            viewMode === 'LIST'
              ? 'grid-cols-1'
              : (activeType === ParaType.AREA || activeType === ParaType.PROJECT)
                ? 'grid-cols-[repeat(auto-fill,minmax(340px,1fr))]'
                : 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]'
          }`}>
            {categoryItems.map(item => {
                // Find child resources for Project/Area cards using 'allItems'
                let childResources: ParaItem[] | undefined = undefined;
                let relatedProjects: ParaItem[] | undefined = undefined;
                let relatedTasks: ParaItem[] | undefined = undefined;

                if (allItems.length > 0) {
                    if (item.type === ParaType.PROJECT || item.type === ParaType.AREA) {
                        childResources = allItems.filter(child =>
                            child.type === ParaType.RESOURCE &&
                            (child.relatedItemIds?.includes(item.id) || child.category === item.title)
                        );
                    }
                    // Area cards: show related Projects
                    if (item.type === ParaType.AREA) {
                        relatedProjects = allItems.filter(child =>
                            child.type === ParaType.PROJECT &&
                            (child.category === item.title || child.relatedItemIds?.includes(item.id))
                        );
                    }
                    // Project cards: show related Tasks
                    if (item.type === ParaType.PROJECT) {
                        relatedTasks = allItems.filter(child =>
                            child.type === ParaType.TASK &&
                            child.relatedItemIds?.includes(item.id)
                        ).sort((a, b) => (a.isCompleted ? 1 : 0) - (b.isCompleted ? 1 : 0));
                    }
                }

                return (
                <div key={item.id} className="relative group">
                    {/* Checkbox Overlay */}
                    <div className={`absolute top-3 left-3 z-10 ${selectedIds.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => onSelect(item.id)}
                            className="w-5 h-5 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500 shadow-sm"
                        />
                    </div>

                    {item.type === ParaType.TASK ? (
                        <TaskCard
                            item={item}
                            onDelete={onDelete}
                            onArchive={onArchive}
                            onToggleComplete={onToggleComplete}
                            onEdit={onEdit}
                            onClick={onItemClick}
                            allItemsMap={allItemsMap}
                            isSelected={selectedIds.has(item.id)}
                        />
                    ) : (
                        <ParaCard
                            item={item}
                            onDelete={onDelete}
                            onArchive={onArchive}
                            onEdit={onEdit}
                            onClick={onItemClick}
                            allItemsMap={allItemsMap}
                            isSelected={selectedIds.has(item.id)}
                            childResources={childResources}
                            relatedProjects={relatedProjects}
                            relatedTasks={relatedTasks}
                        />
                    )}
                </div>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- HIERARCHY COMPONENT ---
const HierarchyView: React.FC<{
  items: ParaItem[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onToggleComplete?: (id: string, status: boolean) => void;
  onItemClick?: (id: string) => void;
}> = ({ items, onDelete, onArchive, onToggleComplete, onItemClick }) => {
    
    const areas = items.filter(i => i.type === ParaType.AREA);
    const projects = items.filter(i => i.type === ParaType.PROJECT);
    const tasks = items.filter(i => i.type === ParaType.TASK);

    const getProjects = (area: ParaItem) => projects.filter(p => 
        p.category === area.title || (p.relatedItemIds && p.relatedItemIds.includes(area.id))
    );

    const getTasks = (project: ParaItem) => tasks.filter(t => 
         (t.relatedItemIds && t.relatedItemIds.includes(project.id))
    );

    const unassignedProjects = projects.filter(p => !areas.some(a => p.category === a.title || p.relatedItemIds?.includes(a.id)));

    return (
        <div className="pb-32 space-y-6 animate-in fade-in">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-2">
                <Layers className="w-6 h-6 text-cyan-300" />
                System Hierarchy
            </h2>

            {areas.map(area => (
                <div key={area.id} className="rounded-xl border border-slate-700/80 bg-slate-900/70 overflow-hidden shadow-sm">
                    <div onClick={() => onItemClick && onItemClick(area.id)} className="bg-slate-900 p-4 border-b border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 transition-colors">
                        <div className="flex items-center gap-2">
                             <div className="p-1.5 bg-cyan-500/10 text-cyan-300 rounded-lg"><Layers className="w-4 h-4" /></div>
                             <h3 className="font-bold text-slate-100 text-lg">{area.title}</h3>
                        </div>
                        <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Area</span>
                    </div>

                    <div className="p-4 space-y-4">
                        {getProjects(area).length === 0 ? <div className="text-sm text-slate-500 italic pl-10">No active projects</div> : 
                            getProjects(area).map(project => (
                                <div key={project.id} className="relative pl-6 border-l-2 border-slate-700 ml-3">
                                    <div onClick={() => onItemClick && onItemClick(project.id)} className="flex items-center justify-between mb-2 group cursor-pointer hover:underline">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-rose-300" />
                                            <span className="font-semibold text-slate-100">{project.title}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1 pl-6">
                                        {getTasks(project).map(task => (
                                            <div key={task.id} onClick={() => onItemClick && onItemClick(task.id)} className="flex items-center gap-2 text-sm group min-h-[24px] cursor-pointer hover:bg-slate-800/70 p-1 rounded">
                                                <button onClick={(e) => {e.stopPropagation(); onToggleComplete && onToggleComplete(task.id, !!task.isCompleted)}} className={task.isCompleted ? 'text-emerald-300' : 'text-slate-500 hover:text-emerald-300'}>
                                                    {task.isCompleted ? <CheckSquare className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className={`truncate ${task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{task.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            ))}
            
            {/* Render Unassigned Projects Logic here (Simplified for brevity as concept matches above) */}
             {unassignedProjects.length > 0 && (
                <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 overflow-hidden shadow-sm mt-8">
                    <div className="bg-slate-900 p-4 border-b border-slate-700">
                        <h3 className="font-bold text-slate-200 flex items-center gap-2"><Folder className="w-4 h-4" /> Unassigned Projects</h3>
                    </div>
                    <div className="p-4 space-y-4">
                        {unassignedProjects.map(project => (
                             <div key={project.id} className="relative pl-6 border-l-2 border-slate-700 ml-3">
                                <div onClick={() => onItemClick && onItemClick(project.id)} className="flex items-center justify-between mb-2 group cursor-pointer hover:underline">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-4 h-4 text-rose-300" />
                                        <span className="font-semibold text-slate-100">{project.title}</span>
                                    </div>
                                </div>
                                {/* Tasks Loop */}
                             </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
