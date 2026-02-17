
import React, { useMemo } from 'react';
import { ParaItem, ParaType } from '../types';
import { X, Calendar, Tag, ArrowUpRight, Folder, CheckSquare, Layers, FileText, ChevronRight, Link2, Pencil, ExternalLink, CornerDownRight, Circle, Book, BarChart3, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ParaItem | null;
  allItems: ParaItem[];
  onNavigate: (itemId: string) => void; // Click child to open its detail
  onEdit: (itemId: string) => void;
  onToggleComplete?: (itemId: string, currentStatus: boolean) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
    isOpen, 
    onClose, 
    item, 
    allItems, 
    onNavigate, 
    onEdit,
    onToggleComplete
}) => {
  if (!isOpen || !item) return null;

  // --- LOGIC: FIND RELATIONS ---
  
  // 1. Find PARENT
  const parentItem = useMemo(() => {
      if (item.type === ParaType.AREA) return null;
      
      const explicitParent = allItems.find(i => 
          i.relatedItemIds?.includes(item.id) || 
          item.relatedItemIds?.includes(i.id)
      );
      
      if (explicitParent) return explicitParent;

      const categoryParent = allItems.find(i => i.title === item.category && (i.type === ParaType.AREA || i.type === ParaType.PROJECT));
      return categoryParent || null;
  }, [item, allItems]);

  // 2. Find DIRECT CHILDREN
  const childrenItems = useMemo(() => {
      return allItems.filter(child => {
          if (child.id === item.id) return false;
          const isLinked = child.relatedItemIds?.includes(item.id) || item.relatedItemIds?.includes(child.id);
          const isCategoryMatch = child.category === item.title;
          return isLinked || isCategoryMatch;
      });
  }, [item, allItems]);

  const childProjects = childrenItems.filter(i => i.type === ParaType.PROJECT);
  const childTasks = childrenItems.filter(i => i.type === ParaType.TASK);
  const childResources = childrenItems.filter(i => i.type === ParaType.RESOURCE);

  // Helper: Find Contents belonging to a specific Project (For Grandchild view)
  const getProjectContents = (projectId: string) => {
      const tasks = allItems.filter(t => 
          t.type === ParaType.TASK && 
          t.relatedItemIds?.includes(projectId) &&
          !t.isCompleted // Show active tasks primarily
      );
      const resources = allItems.filter(r => 
          r.type === ParaType.RESOURCE && 
          r.relatedItemIds?.includes(projectId)
      );
      return { tasks, resources };
  };

  // Logic for Area Summary (Bottom up Aggregation)
  const areaStats = useMemo(() => {
      if (item.type !== ParaType.AREA) return null;

      let totalTasks = childTasks.length;
      let totalResources = childResources.length;

      // Add nested counts from projects
      childProjects.forEach(p => {
          const contents = getProjectContents(p.id);
          totalTasks += contents.tasks.length;
          totalResources += contents.resources.length;
      });

      return {
          projects: childProjects.length,
          tasks: totalTasks,
          resources: totalResources
      };
  }, [item, childProjects, childTasks, childResources, allItems]);

  // NEW: Aggregate ALL Resources (Direct + Nested) for Left Panel Display
  const aggregatedResources = useMemo(() => {
      let resources = [...childResources];
      
      // If Area, grab resources from child projects too
      if (item.type === ParaType.AREA) {
          childProjects.forEach(p => {
              const { resources: pResources } = getProjectContents(p.id);
              resources = [...resources, ...pResources];
          });
      }
      
      // Deduplicate by ID
      const uniqueResources = new Map();
      resources.forEach(r => uniqueResources.set(r.id, r));
      return Array.from(uniqueResources.values());
  }, [item, childResources, childProjects, allItems]);


  const getIcon = (type: ParaType, className="w-5 h-5") => {
      switch(type) {
          case ParaType.PROJECT: return <Folder className={`${className} text-red-500`} />;
          case ParaType.AREA: return <Layers className={`${className} text-orange-500`} />;
          case ParaType.TASK: return <CheckSquare className={`${className} text-emerald-500`} />;
          case ParaType.RESOURCE: return <Book className={`${className} text-blue-500`} />;
          default: return <FileText className={`${className} text-blue-500`} />;
      }
  };

  const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      {/* Container */}
      <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col relative z-10 overflow-hidden border border-slate-700 animate-in zoom-in-95 duration-200">
        
        {/* Header Area */}
        <div className="px-8 py-6 border-b border-slate-700 bg-slate-800/60 backdrop-blur flex justify-between items-start shrink-0">
            <div className="flex-1 mr-8">
                {/* Breadcrumbs / Parent Link */}
                {parentItem ? (
                    <button 
                        onClick={() => onNavigate(parentItem.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors mb-2 group"
                    >
                        {getIcon(parentItem.type, "w-3.5 h-3.5 grayscale group-hover:grayscale-0")}
                        <span>{parentItem.title}</span>
                        <ChevronRight className="w-3 h-3" />
                        <span className="text-slate-200">{item.title}</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-slate-800 ${
                            item.type === ParaType.AREA ? 'text-orange-400 border-orange-600' :
                            item.type === ParaType.PROJECT ? 'text-red-400 border-red-600' : 'text-slate-400 border-slate-600'
                        }`}>
                            {item.type}
                        </span>
                        {item.category && item.category !== 'General' && (
                            <span className="text-xs text-slate-400 font-medium">
                                • {item.category}
                            </span>
                        )}
                    </div>
                )}

                <h2 className={`text-3xl font-bold text-slate-100 leading-tight ${item.isCompleted ? 'line-through text-slate-500' : ''}`}>
                    {item.title}
                </h2>
            </div>
            
            <div className="flex gap-2">
                {item.type === ParaType.TASK && onToggleComplete && (
                    <button
                        onClick={() => onToggleComplete(item.id, !!item.isCompleted)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all shadow-sm ${
                            item.isCompleted
                                ? 'bg-slate-800 border-slate-600 text-slate-300 hover:text-amber-400 hover:border-amber-600'
                                : 'bg-emerald-900/30 border-emerald-700 text-emerald-400 hover:bg-emerald-900/50'
                        }`}
                    >
                        {item.isCompleted ? <Circle className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                        <span className="hidden sm:inline">{item.isCompleted ? 'Reopen' : 'Mark Done'}</span>
                    </button>
                )}
                <button onClick={() => onEdit(item.id)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-medium text-slate-300 hover:text-indigo-400 hover:border-indigo-600 transition-all shadow-sm">
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit</span>
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-200 transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
            <div className="flex flex-col md:flex-row min-h-full">

                {/* Left Column: Content & Metadata (60%) */}
                <div className="w-full md:w-7/12 p-8 border-b md:border-b-0 md:border-r border-slate-700 bg-slate-900 flex flex-col">
                    <div className="prose prose-invert max-w-none mb-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Description</h3>
                        {item.content ? (
                            <ReactMarkdown>{item.content}</ReactMarkdown>
                        ) : (
                            <p className="text-slate-400 italic text-sm">No description provided.</p>
                        )}
                    </div>

                    {/* Attachments */}
                    {item.attachments && item.attachments.length > 0 && (
                        <div className="mt-2 pt-6 border-t border-slate-700">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Paperclip className="w-3 h-3"/> Attachments</h4>
                            <div className="flex flex-col gap-2">
                                {item.attachments.map((url, i) => {
                                    const isImg = isImageFile(url);
                                    return (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                                        className="flex items-center gap-3 p-2 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 hover:border-indigo-600 transition-all group"
                                        >
                                            {isImg ? (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-600 shrink-0">
                                                    <img src={url} className="w-full h-full object-cover" alt="attachment" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-indigo-900/30 flex items-center justify-center shrink-0 text-indigo-400">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-slate-300 truncate group-hover:text-indigo-400">Attachment {i+1}</p>
                                                <p className="text-[10px] text-slate-400">Click to view</p>
                                            </div>
                                            <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                                        </a>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="mt-8 pt-6 border-t border-slate-700 grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Created</span>
                            <div className="flex items-center gap-1.5 text-sm text-slate-300">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                {new Date(item.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                        {item.dueDate && (
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Due Date</span>
                                <div className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(item.dueDate).toLocaleDateString()}
                                </div>
                            </div>
                        )}
                        <div className="col-span-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tags</span>
                            <div className="flex flex-wrap gap-2">
                                {item.tags.length > 0 ? item.tags.map(tag => (
                                    <span key={tag} className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs font-medium border border-slate-700">
                                        #{tag}
                                    </span>
                                )) : <span className="text-sm text-slate-400">-</span>}
                            </div>
                        </div>
                    </div>

                    {/* NEW SECTION: ALL RESOURCES (Moved up per user request) */}
                    {aggregatedResources.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-slate-700">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                <Book className="w-3 h-3 text-blue-500" />
                                All Related Resources <span className="bg-blue-900/30 text-blue-400 px-1.5 rounded-full text-[10px]">{aggregatedResources.length}</span>
                            </h4>
                            <div className="space-y-2">
                                {aggregatedResources.map(res => (
                                     <div 
                                        key={res.id} 
                                        onClick={() => onNavigate(res.id)}
                                        className="flex items-center gap-3 p-2.5 bg-blue-900/20 border border-blue-800 rounded-lg hover:bg-blue-900/40 hover:border-blue-600 cursor-pointer transition-all group"
                                    >
                                        <div className="p-1.5 bg-slate-800 rounded-md text-blue-400 shadow-sm border border-blue-800">
                                            <Book className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-300 truncate group-hover:text-blue-400">{res.title}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{res.category}</p>
                                        </div>
                                        <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Hierarchy Tree (40%) */}
                <div className="w-full md:w-5/12 p-8 bg-slate-800/30">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Hierarchy & Contents
                    </h3>

                    {/* Area Stats (Bottom-Up) */}
                    {item.type === ParaType.AREA && areaStats && (
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-center shadow-sm">
                                <div className="text-xl font-bold text-red-400">{areaStats.projects}</div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Projects</div>
                            </div>
                            <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-center shadow-sm">
                                <div className="text-xl font-bold text-emerald-400">{areaStats.tasks}</div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Tasks</div>
                            </div>
                            <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl text-center shadow-sm">
                                <div className="text-xl font-bold text-blue-400">{areaStats.resources}</div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Res</div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        
                        {/* 1. PROJECTS LIST (If Area) */}
                        {childProjects.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1">Projects</h4>
                                <div className="space-y-4">
                                    {childProjects.map(project => {
                                        const { tasks: projectTasks, resources: projectResources } = getProjectContents(project.id);
                                        const hasContent = projectTasks.length > 0 || projectResources.length > 0;
                                        
                                        return (
                                            <div key={project.id} className="relative">
                                                {/* Project Card */}
                                                <div 
                                                    onClick={() => onNavigate(project.id)}
                                                    className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-sm hover:shadow-md hover:border-red-600 cursor-pointer transition-all z-10 relative"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-red-900/30 text-red-400 rounded-lg">
                                                            <Folder className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-bold text-slate-200 block">{project.title}</span>
                                                            <div className="flex gap-2 text-[10px] text-slate-400">
                                                                <span>{projectTasks.length} tasks</span>
                                                                {projectResources.length > 0 && <span>• {projectResources.length} res</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                                </div>

                                                {/* NESTED CONTENTS (Tasks & Resources) */}
                                                {hasContent && (
                                                    <div className="ml-6 pl-4 border-l-2 border-slate-600 pt-2 pb-1 space-y-2 mt-[-4px]">
                                                        
                                                        {/* Resources first (usually static) */}
                                                        {projectResources.map(res => (
                                                             <div 
                                                                key={res.id} 
                                                                onClick={() => onNavigate(res.id)}
                                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-900/30 cursor-pointer transition-colors group"
                                                            >
                                                                <div className="w-4 h-px bg-slate-600 group-hover:bg-blue-600"></div>
                                                                <div className="w-4 h-4 flex items-center justify-center">
                                                                    <Book className="w-3.5 h-3.5 text-blue-400" />
                                                                </div>
                                                                <span className="text-sm text-slate-300 group-hover:text-blue-400">
                                                                    {res.title}
                                                                </span>
                                                            </div>
                                                        ))}

                                                        {/* Tasks */}
                                                        {projectTasks.map(task => (
                                                            <div 
                                                                key={task.id} 
                                                                onClick={() => onNavigate(task.id)}
                                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors group"
                                                            >
                                                                <div className="w-4 h-px bg-slate-600 group-hover:bg-slate-500"></div>
                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${task.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500 bg-slate-800'}`}>
                                                                    {task.isCompleted && <CheckSquare className="w-3 h-3 text-white" />}
                                                                </div>
                                                                <span className={`text-sm ${task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                                                    {task.title}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 2. DIRECT RESOURCES LIST (If Project or Area) */}
                         {childResources.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1 flex items-center gap-2">
                                    Direct Resources <span className="bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">{childResources.length}</span>
                                </h4>
                                <div className="space-y-2">
                                    {childResources.map(res => (
                                         <div 
                                            key={res.id} 
                                            onClick={() => onNavigate(res.id)}
                                            className="flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-xl hover:shadow-sm hover:border-blue-600 cursor-pointer transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-900/30 text-blue-400 rounded-lg">
                                                    <Book className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-medium text-slate-300">{res.title}</span>
                                            </div>
                                            <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3. DIRECT TASKS LIST */}
                        {childTasks.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1 flex items-center gap-2">
                                    Tasks <span className="bg-emerald-900/30 text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">{childTasks.length}</span>
                                </h4>
                                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-700">
                                    {childTasks.map(child => (
                                        <div key={child.id} onClick={() => onNavigate(child.id)} className="flex items-center p-3 hover:bg-slate-700 cursor-pointer transition-colors group">
                                            <div className={`mr-3 p-1 rounded-md ${child.isCompleted ? 'text-emerald-400 bg-emerald-900/30' : 'text-slate-400 bg-slate-700 group-hover:text-slate-300'}`}>
                                                {child.isCompleted ? <CheckSquare className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1">
                                                <span className={`text-sm font-medium block ${child.isCompleted ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                                                    {child.title}
                                                </span>
                                                {child.dueDate && (
                                                    <span className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                                                        <Calendar className="w-3 h-3" /> {new Date(child.dueDate).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Empty State */}
                        {childProjects.length === 0 && childTasks.length === 0 && childResources.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50">
                                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center shadow-sm mb-3">
                                    <Folder className="w-6 h-6 text-slate-500" />
                                </div>
                                <p className="text-sm font-medium text-slate-400">Empty Item</p>
                                <p className="text-xs text-slate-500 mt-1">No sub-projects, tasks, or resources found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
