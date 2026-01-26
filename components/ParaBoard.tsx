
import React, { useMemo, useState } from 'react';
import { ParaItem, ParaType, ViewMode } from '../types';
import ReactMarkdown from 'react-markdown';
import { Calendar, Tag, Link2, CheckSquare, Square, Trash2, Target, Book, Layers, ArrowRight, Paperclip, FileIcon, ExternalLink, FileText, Archive, ChevronDown, ChevronRight, CornerDownRight, Folder, Pencil } from 'lucide-react';

interface ParaBoardProps {
  items: ParaItem[];
  activeType: ParaType | 'All';
  viewMode: ViewMode;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void; 
  onToggleComplete?: (id: string, currentStatus: boolean) => void;
  onEdit?: (id: string) => void; // New Prop for Edit
  allItemsMap?: Record<string, ParaItem>; 
  // Selection Props
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
}

// Helper to check if url is an image
const isImageFile = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);
};

export const ParaBoard: React.FC<ParaBoardProps> = ({ 
    items, 
    activeType, 
    viewMode,
    onDelete,
    onArchive,
    onToggleComplete,
    onEdit,
    allItemsMap = {},
    selectedIds,
    onSelect,
    onSelectAll
}) => {
  
  // --- DASHBOARD VIEW (AREA HUB) ---
  if (activeType === 'All') {
      const areas = items.filter(i => i.type === ParaType.AREA);
      const unassignedItems = items.filter(i => i.type !== ParaType.AREA && !areas.some(a => a.title === i.category));

      // JAY'S FIX: Improved Logic for Recursive Counting (Grandchildren)
      const areaStats = areas.map(area => {
          // 1. Direct Children: Items linked to Area OR Category matches Area
          const directChildren = items.filter(i => 
              (i.category === area.title || i.relatedItemIds?.includes(area.id)) && i.id !== area.id
          );

          // 2. Identify Projects within Direct Children
          const childProjects = directChildren.filter(i => i.type === ParaType.PROJECT);

          // 3. Grandchildren: Find Tasks linked to those Projects
          const projectIds = childProjects.map(p => p.id);
          const grandchildTasks = items.filter(i => 
              i.type === ParaType.TASK && 
              i.relatedItemIds?.some(relId => projectIds.includes(relId)) &&
              !directChildren.includes(i) // Avoid double counting if linked to both
          );

          // Merge Lists
          const allRelatedTasks = [...directChildren.filter(i => i.type === ParaType.TASK), ...grandchildTasks];
          const allRelatedResources = directChildren.filter(i => i.type === ParaType.RESOURCE);

          const activeProjects = childProjects.filter(p => p.status !== 'Completed').length;
          const pendingTasks = allRelatedTasks.filter(t => !t.isCompleted).length;
          const completedTasks = allRelatedTasks.filter(t => t.isCompleted).length;
          const totalTasks = allRelatedTasks.length;
          
          const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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
          <div className="pb-32 space-y-8 animate-in fade-in duration-500">
              
              {/* Header */}
              <div className="flex flex-col gap-2 mb-6">
                  <h1 className="text-3xl font-bold text-slate-800">Life Dashboard</h1>
                  <p className="text-slate-500">Your areas of responsibility at a glance.</p>
              </div>

              {/* AREA CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {areaStats.map(({ area, stats }) => (
                      <div key={area.id} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:border-indigo-100 transition-all duration-300 relative overflow-hidden">
                          {/* Top Decorative Line */}
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-orange-500"></div>

                          <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                  <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
                                     <Layers className="w-6 h-6" />
                                  </div>
                                  <div>
                                     <h3 className="text-lg font-bold text-slate-900 leading-tight">{area.title}</h3>
                                     <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Area</span>
                                  </div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {onEdit && (
                                    <button onClick={() => onEdit(area.id)} className="text-slate-300 hover:text-indigo-500 p-1">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button onClick={() => onDelete(area.id)} className="text-slate-300 hover:text-red-500 p-1">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 mb-6">
                              <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                                  <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
                                      <Target className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="text-lg font-bold text-slate-800 leading-none">{stats.projects}</div>
                                  <div className="text-[9px] text-slate-400 font-medium mt-1">Projects</div>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                                  <div className="flex items-center justify-center gap-1 text-emerald-500 mb-1">
                                      <CheckSquare className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="text-lg font-bold text-slate-800 leading-none">{stats.tasks}</div>
                                  <div className="text-[9px] text-slate-400 font-medium mt-1">Tasks</div>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                                  <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                                      <Book className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="text-lg font-bold text-slate-800 leading-none">{stats.resources}</div>
                                  <div className="text-[9px] text-slate-400 font-medium mt-1">Resources</div>
                              </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                                  <span>Task Completion</span>
                                  <span>{stats.progress}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-500"
                                    style={{ width: `${stats.progress}%` }}
                                  ></div>
                              </div>
                          </div>
                      </div>
                  ))}

                  {/* Add Area Placeholder */}
                  {areaStats.length === 0 && (
                      <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <h3 className="text-slate-500 font-medium">No Areas Defined</h3>
                          <p className="text-sm text-slate-400 mt-1">Create an 'Area' (e.g., Health, Work) to see it here.</p>
                      </div>
                  )}
              </div>

              {/* Unassigned Items (Optional Section) */}
              {unassignedItems.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                          Unassigned / Inbox
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75 hover:opacity-100 transition-opacity">
                          {unassignedItems.slice(0, 6).map(item => (
                              <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                                  <div>
                                      <p className="font-medium text-slate-700 text-sm truncate max-w-[150px]">{item.title}</p>
                                      <p className="text-[10px] text-slate-400">{item.type} • {item.category}</p>
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-slate-300" />
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
          />
      );
  }

  // --- STANDARD FILTERED LIST VIEWS (Existing Logic) ---
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

  // Grouping (For Grid/List views)
  const groupedItems = sortedItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ParaItem[]>);

  if (displayItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Tag className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-lg font-medium">No {activeType} items yet</p>
        <p className="text-sm">Create your first item to get started.</p>
      </div>
    );
  }

  // --- RENDER TABLE VIEW (FLAT LIST) ---
  if (viewMode === 'TABLE') {
      return (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                          <th className="px-4 py-3 w-10">
                              <input 
                                type="checkbox" 
                                checked={displayItems.length > 0 && selectedIds.size === displayItems.length}
                                onChange={() => onSelectAll(displayItems.map(i => i.id))}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                          </th>
                          <th className="px-4 py-3">Title</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {sortedItems.map(item => (
                          <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(item.id) ? 'bg-indigo-50/50' : ''}`}>
                              <td className="px-4 py-3">
                                  <input 
                                    type="checkbox" 
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => onSelect(item.id)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                              </td>
                              <td className="px-4 py-3">
                                  <div className={`font-medium ${item.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                      {item.title}
                                  </div>
                                  <div className="text-xs text-slate-400 truncate max-w-xs">{item.content}</div>
                              </td>
                              <td className="px-4 py-3">
                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">{item.category}</span>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">{item.type}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs">{new Date(item.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-right flex justify-end gap-2">
                                  {item.type === ParaType.TASK && (
                                      <button onClick={() => onToggleComplete && onToggleComplete(item.id, !!item.isCompleted)} className={item.isCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}>
                                          <CheckSquare className="w-4 h-4" />
                                      </button>
                                  )}
                                  {onEdit && (
                                    <button onClick={() => onEdit(item.id)} className="text-slate-300 hover:text-indigo-500" title="Edit">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                  )}
                                  {item.type !== ParaType.ARCHIVE && (
                                    <button onClick={() => onArchive(item.id)} className="text-slate-300 hover:text-slate-600" title="Archive">
                                        <Archive className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      );
  }

  // --- RENDER GRID / LIST VIEW (GROUPED) ---
  return (
    <div className="pb-32 space-y-8">
      {Object.entries(groupedItems).map(([category, categoryItems]: [string, ParaItem[]]) => (
        <div key={category} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-bold text-slate-800">{category}</h2>
            <div className="h-px flex-1 bg-slate-200"></div>
            <span className="text-xs font-medium text-slate-400">{categoryItems.length} items</span>
          </div>

          <div className={`grid gap-4 ${viewMode === 'LIST' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {categoryItems.map(item => (
                <div key={item.id} className="relative group">
                    {/* Checkbox Overlay for Grid/List */}
                    <div className={`absolute top-3 left-3 z-10 ${selectedIds.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        <input 
                            type="checkbox" 
                            checked={selectedIds.has(item.id)}
                            onChange={() => onSelect(item.id)}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shadow-sm"
                        />
                    </div>

                    {item.type === ParaType.TASK ? (
                        <TaskCard 
                            item={item} 
                            onDelete={onDelete}
                            onArchive={onArchive}
                            onToggleComplete={onToggleComplete}
                            onEdit={onEdit}
                            allItemsMap={allItemsMap}
                            isSelected={selectedIds.has(item.id)}
                        />
                    ) : (
                        <Card 
                            item={item} 
                            onDelete={onDelete} 
                            onArchive={onArchive}
                            onEdit={onEdit}
                            allItemsMap={allItemsMap} 
                            isSelected={selectedIds.has(item.id)}
                        />
                    )}
                </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// --- COMPONENTS ---

// JAY'S NOTE: Define HierarchyView here so ParaBoard can use it.
const HierarchyView: React.FC<{
  items: ParaItem[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onToggleComplete?: (id: string, status: boolean) => void;
}> = ({ items, onDelete, onArchive, onToggleComplete }) => {
    
    // Grouping Logic
    const areas = items.filter(i => i.type === ParaType.AREA);
    const projects = items.filter(i => i.type === ParaType.PROJECT);
    const tasks = items.filter(i => i.type === ParaType.TASK);

    // Helper: Find projects in area
    const getProjects = (area: ParaItem) => {
        return projects.filter(p => 
            p.category === area.title || // Direct string match
            (p.relatedItemIds && p.relatedItemIds.includes(area.id)) // Relation match
        );
    };

    // Helper: Find tasks in project
    const getTasks = (project: ParaItem) => {
        return tasks.filter(t => 
             (t.relatedItemIds && t.relatedItemIds.includes(project.id))
        );
    };

    // Unassigned
    const unassignedProjects = projects.filter(p => !areas.some(a => p.category === a.title || p.relatedItemIds?.includes(a.id)));

    return (
        <div className="pb-32 space-y-6 animate-in fade-in">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Layers className="w-6 h-6 text-indigo-600" />
                System Hierarchy
            </h2>

            {/* AREAS */}
            {areas.map(area => (
                <div key={area.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Area Header */}
                    <div className="bg-orange-50/50 p-4 border-b border-orange-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                             <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg">
                                 <Layers className="w-4 h-4" />
                             </div>
                             <h3 className="font-bold text-slate-900 text-lg">{area.title}</h3>
                        </div>
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Area</span>
                    </div>

                    <div className="p-4 space-y-4">
                        {getProjects(area).length === 0 ? (
                            <div className="text-sm text-slate-400 italic pl-10">No active projects</div>
                        ) : (
                            getProjects(area).map(project => (
                                <div key={project.id} className="relative pl-6 border-l-2 border-slate-100 ml-3">
                                    {/* Project Header */}
                                    <div className="flex items-center justify-between mb-2 group">
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-red-500" />
                                            <span className="font-semibold text-slate-800">{project.title}</span>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                            <button onClick={() => onArchive(project.id)} className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-slate-600"><Archive className="w-3 h-3" /></button>
                                            <button onClick={() => onDelete(project.id)} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                    </div>

                                    {/* Tasks */}
                                    <div className="space-y-1 pl-6">
                                        {getTasks(project).map(task => (
                                            <div key={task.id} className="flex items-center gap-2 text-sm group min-h-[24px]">
                                                <button 
                                                    onClick={() => onToggleComplete && onToggleComplete(task.id, !!task.isCompleted)}
                                                    className={task.isCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}
                                                >
                                                    {task.isCompleted ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className={`truncate ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                                    {task.title}
                                                </span>
                                                <button onClick={() => onDelete(task.id)} className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {getTasks(project).length === 0 && <div className="text-xs text-slate-300 italic">No tasks</div>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ))}

            {/* Unassigned Projects */}
            {unassignedProjects.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-8">
                    <div className="bg-slate-50 p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Folder className="w-4 h-4" /> Unassigned Projects
                        </h3>
                    </div>
                    <div className="p-4 space-y-4">
                        {unassignedProjects.map(project => (
                             <div key={project.id} className="relative pl-6 border-l-2 border-slate-100 ml-3">
                                <div className="flex items-center justify-between mb-2 group">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-4 h-4 text-red-500" />
                                        <span className="font-semibold text-slate-800">{project.title}</span>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                         <button onClick={() => onDelete(project.id)} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </div>
                                <div className="space-y-1 pl-6">
                                    {getTasks(project).map(task => (
                                        <div key={task.id} className="flex items-center gap-2 text-sm group">
                                            <button 
                                                onClick={() => onToggleComplete && onToggleComplete(task.id, !!task.isCompleted)}
                                                className={task.isCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}
                                            >
                                                {task.isCompleted ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                            </button>
                                            <span className={`truncate ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                                {task.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const TaskCard: React.FC<{
    item: ParaItem;
    onDelete: (id: string) => void;
    onArchive: (id: string) => void;
    onToggleComplete?: (id: string, status: boolean) => void;
    onEdit?: (id: string) => void;
    allItemsMap: Record<string, ParaItem>;
    isSelected: boolean;
}> = ({ item, onDelete, onArchive, onToggleComplete, onEdit, allItemsMap, isSelected }) => {
    return (
        <div className={`
            group bg-white rounded-xl border p-4 transition-all duration-200 flex flex-col h-full
            ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : ''}
            ${item.isCompleted 
                ? 'border-slate-100 opacity-60 bg-slate-50' 
                : 'border-emerald-100 hover:shadow-md hover:border-emerald-200'}
        `}>
            <div className="flex items-start gap-3 pl-6"> {/* Padding left for checkbox space */}
                <button 
                    onClick={() => onToggleComplete && onToggleComplete(item.id, !!item.isCompleted)}
                    className={`mt-1 flex-shrink-0 transition-colors ${item.isCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
                >
                    {item.isCompleted ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                </button>
                
                <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-sm text-slate-900 mb-1 leading-tight ${item.isCompleted ? 'line-through text-slate-500' : ''}`}>
                        {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                        <ReactMarkdown>{item.content}</ReactMarkdown>
                    </p>
                    
                    {/* Linked Project/Area */}
                    {item.relatedItemIds && item.relatedItemIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {item.relatedItemIds.map(relId => {
                                const relItem = allItemsMap[relId];
                                if (!relItem) return null;
                                return (
                                    <span key={relId} className="flex items-center gap-1 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-full">
                                        <Link2 className="w-2.5 h-2.5" />
                                        <span className="truncate">{relItem.title}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    
                    {/* Attachments Preview */}
                    {item.attachments && item.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {item.attachments.map((url, i) => {
                                const isImg = isImageFile(url);
                                return (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                                       className={`
                                           relative rounded border border-slate-200 overflow-hidden shrink-0 hover:ring-2 ring-indigo-500
                                           ${isImg ? 'w-10 h-10' : 'flex items-center gap-1 px-2 py-1 bg-slate-50 text-xs'}
                                       `}
                                       title="View Attachment"
                                    >
                                        {isImg ? (
                                            <img src={url} alt="attachment" className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                                <span className="max-w-[80px] truncate text-[9px] text-slate-600">File {i+1}</span>
                                            </>
                                        )}
                                    </a>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-2">
                         <span className="text-[10px] text-slate-400">
                            {item.dueDate ? `Due: ${new Date(item.dueDate).toLocaleDateString()}` : new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                         </span>
                         {/* Hover Actions */}
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onEdit && (
                                <button onClick={() => onEdit(item.id)} className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-indigo-500" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {item.type !== ParaType.ARCHIVE && (
                                <button onClick={() => onArchive(item.id)} className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-slate-600" title="Archive">
                                    <Archive className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button onClick={() => onDelete(item.id)} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Card: React.FC<{ 
  item: ParaItem; 
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onEdit?: (id: string) => void;
  allItemsMap: Record<string, ParaItem>;
  isSelected: boolean;
}> = ({ item, onDelete, onArchive, onEdit, allItemsMap, isSelected }) => {
  
  const typeColors = {
    [ParaType.PROJECT]: 'bg-red-50 text-red-700 border-red-100',
    [ParaType.AREA]: 'bg-orange-50 text-orange-700 border-orange-100',
    [ParaType.RESOURCE]: 'bg-blue-50 text-blue-700 border-blue-100',
    [ParaType.ARCHIVE]: 'bg-gray-50 text-gray-700 border-gray-100',
    [ParaType.TASK]: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };

  return (
    <div className={`
        group bg-white rounded-xl border p-5 hover:shadow-lg transition-all duration-200 relative flex flex-col h-full pl-8
        ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-slate-200'}
    `}>
      <div className="flex justify-between items-start mb-3">
        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${typeColors[item.type]}`}>
          {item.type}
        </span>
        
        {/* Hover Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4 bg-white shadow-sm border rounded-lg p-1">
             {onEdit && (
                <button onClick={() => onEdit(item.id)} className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-indigo-500" title="Edit">
                    <Pencil className="w-4 h-4" />
                </button>
             )}
             {item.type !== ParaType.ARCHIVE && (
                <button onClick={() => onArchive(item.id)} className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-600" title="Archive">
                    <Archive className="w-4 h-4" />
                </button>
             )}
             <button onClick={() => onDelete(item.id)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
             </button>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2 leading-tight">{item.title}</h3>
      
      <div className="prose prose-sm prose-slate mb-4 line-clamp-4 flex-1 text-slate-600">
        <ReactMarkdown>{item.content}</ReactMarkdown>
      </div>
      
      {/* Attachments Section */}
      {item.attachments && item.attachments.length > 0 && (
         <div className="mb-4">
             <div className="flex flex-wrap gap-2">
                 {item.attachments.map((url, i) => {
                     const isImg = isImageFile(url);
                     return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                           className={`
                             flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200 hover:text-indigo-600 border border-slate-200 transition-colors
                           `}
                        >
                            {isImg ? <div className="w-3 h-3 rounded-full bg-purple-400"></div> : <FileText className="w-3 h-3" />}
                            {isImg ? `Image ${i+1}` : `File ${i+1}`}
                            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                        </a>
                     );
                 })}
             </div>
         </div>
      )}

      {/* Relations Section */}
      {item.relatedItemIds && item.relatedItemIds.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
            {item.relatedItemIds.map(relId => {
                const relItem = allItemsMap[relId];
                if (!relItem) return null;
                return (
                    <div key={relId} className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200 max-w-full truncate">
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{relItem.title}</span>
                    </div>
                );
            })}
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between text-xs text-slate-400">
        <div className="flex gap-2">
          {item.tags.slice(0, 2).map(tag => (
            <span key={tag} className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
};
