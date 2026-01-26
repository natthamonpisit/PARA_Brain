
import React, { useMemo } from 'react';
import { ParaItem, ParaType } from '../types';
import { X, Calendar, Tag, ArrowUpRight, Folder, CheckSquare, Layers, FileText, ChevronRight, Link2, Pencil, ExternalLink, CornerDownRight, Circle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ParaItem | null;
  allItems: ParaItem[];
  onNavigate: (itemId: string) => void; // Click child to open its detail
  onEdit: (itemId: string) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
    isOpen, 
    onClose, 
    item, 
    allItems, 
    onNavigate,
    onEdit
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

  // Helper: Find Tasks belonging to a specific Project (For Grandchild view)
  const getTasksForProject = (projectId: string) => {
      return allItems.filter(t => 
          t.type === ParaType.TASK && 
          t.relatedItemIds?.includes(projectId) &&
          !t.isCompleted // Show active tasks primarily
      );
  };

  const getIcon = (type: ParaType, className="w-5 h-5") => {
      switch(type) {
          case ParaType.PROJECT: return <Folder className={`${className} text-red-500`} />;
          case ParaType.AREA: return <Layers className={`${className} text-orange-500`} />;
          case ParaType.TASK: return <CheckSquare className={`${className} text-emerald-500`} />;
          default: return <FileText className={`${className} text-blue-500`} />;
      }
  };

  const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      {/* Container: Increased max-w to 5xl for a spacious dashboard feel */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col relative z-10 overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Header Area */}
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/80 backdrop-blur flex justify-between items-start shrink-0">
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
                        <span className="text-slate-800">{item.title}</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-white ${
                            item.type === ParaType.AREA ? 'text-orange-600 border-orange-200' : 
                            item.type === ParaType.PROJECT ? 'text-red-600 border-red-200' : 'text-slate-500 border-slate-200'
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

                <h2 className={`text-3xl font-bold text-slate-900 leading-tight ${item.isCompleted ? 'line-through text-slate-400' : ''}`}>
                    {item.title}
                </h2>
            </div>
            
            <div className="flex gap-2">
                <button onClick={() => onEdit(item.id)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit</span>
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
            <div className="flex flex-col md:flex-row min-h-full">
                
                {/* Left Column: Content & Metadata (40%) */}
                <div className="w-full md:w-5/12 p-8 border-b md:border-b-0 md:border-r border-slate-100 bg-white">
                    <div className="prose prose-slate prose-p:text-slate-600 prose-headings:text-slate-800 max-w-none">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Description</h3>
                        {item.content ? (
                            <ReactMarkdown>{item.content}</ReactMarkdown>
                        ) : (
                            <p className="text-slate-400 italic text-sm">No description provided.</p>
                        )}
                    </div>

                    {/* Attachments */}
                    {item.attachments && item.attachments.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-50">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><PaperclipIcon className="w-3 h-3"/> Attachments</h4>
                            <div className="flex flex-col gap-2">
                                {item.attachments.map((url, i) => {
                                    const isImg = isImageFile(url);
                                    return (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                                        className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 hover:border-indigo-200 transition-all group"
                                        >
                                            {isImg ? (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                                    <img src={url} className="w-full h-full object-cover" alt="attachment" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 text-indigo-500">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-slate-700 truncate group-hover:text-indigo-700">Attachment {i+1}</p>
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
                    <div className="mt-8 pt-6 border-t border-slate-50 grid grid-cols-2 gap-4">
                        <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Created</span>
                            <div className="flex items-center gap-1.5 text-sm text-slate-600">
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
                                    <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium border border-slate-200">
                                        #{tag}
                                    </span>
                                )) : <span className="text-sm text-slate-400">-</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Hierarchy Tree (60%) */}
                <div className="w-full md:w-7/12 p-8 bg-slate-50/30">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Hierarchy & Contents
                    </h3>

                    <div className="space-y-6">
                        
                        {/* 1. PROJECTS LIST (If Area) */}
                        {childProjects.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1">Projects</h4>
                                <div className="space-y-4">
                                    {childProjects.map(project => {
                                        const projectTasks = getTasksForProject(project.id);
                                        return (
                                            <div key={project.id} className="relative">
                                                {/* Project Card */}
                                                <div 
                                                    onClick={() => onNavigate(project.id)}
                                                    className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-red-200 cursor-pointer transition-all z-10 relative"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                                            <Folder className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-bold text-slate-800 block">{project.title}</span>
                                                            <span className="text-[10px] text-slate-400">{projectTasks.length} active tasks</span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                                </div>

                                                {/* NESTED TASKS (The "Under Project" Effect) */}
                                                {projectTasks.length > 0 && (
                                                    <div className="ml-6 pl-4 border-l-2 border-slate-200 pt-2 pb-1 space-y-2 mt-[-4px]">
                                                        {projectTasks.map(task => (
                                                            <div 
                                                                key={task.id} 
                                                                onClick={() => onNavigate(task.id)}
                                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors group"
                                                            >
                                                                <div className="w-4 h-px bg-slate-200 group-hover:bg-slate-300"></div> {/* Connector Line */}
                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${task.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                                                                    {task.isCompleted && <CheckSquare className="w-3 h-3 text-white" />}
                                                                </div>
                                                                <span className={`text-sm ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
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

                        {/* 2. DIRECT TASKS LIST */}
                        {childTasks.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 ml-1 flex items-center gap-2">
                                    Tasks <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{childTasks.length}</span>
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                                    {childTasks.map(child => (
                                        <div key={child.id} onClick={() => onNavigate(child.id)} className="flex items-center p-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                            <div className={`mr-3 p-1 rounded-md ${child.isCompleted ? 'text-emerald-500 bg-emerald-50' : 'text-slate-300 bg-slate-50 group-hover:text-slate-500'}`}>
                                                {child.isCompleted ? <CheckSquare className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1">
                                                <span className={`text-sm font-medium block ${child.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
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
                            <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                                    <Folder className="w-6 h-6 text-slate-300" />
                                </div>
                                <p className="text-sm font-medium text-slate-500">Empty Item</p>
                                <p className="text-xs text-slate-400 mt-1">No sub-projects or tasks found.</p>
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

// Helper Icon
const PaperclipIcon = ({className}:{className?:string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
);
