
import React, { useMemo } from 'react';
import { ParaItem, ParaType } from '../types';
import { X, Calendar, Tag, ArrowUpRight, Folder, CheckSquare, Layers, FileText, ChevronRight, Link2, Pencil, ExternalLink } from 'lucide-react';
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
  
  // 1. Find PARENT (If this item is a child)
  // Logic: Is this item ID inside another item's relatedItemIds? OR Does category match a PARA Title?
  const parentItem = useMemo(() => {
      if (item.type === ParaType.AREA) return null; // Area has no parent
      
      // Try to find explicit parent via relation ID
      const explicitParent = allItems.find(i => 
          i.relatedItemIds?.includes(item.id) || // Parent points to child
          item.relatedItemIds?.includes(i.id)    // Child points to parent
      );
      
      // Priority: Project > Area
      if (explicitParent) return explicitParent;

      // Fallback: Match Category Name to Title (e.g. Category "Health" -> Area "Health")
      const categoryParent = allItems.find(i => i.title === item.category && (i.type === ParaType.AREA || i.type === ParaType.PROJECT));
      return categoryParent || null;
  }, [item, allItems]);

  // 2. Find CHILDREN (If this item is a parent)
  const childrenItems = useMemo(() => {
      return allItems.filter(child => {
          if (child.id === item.id) return false;
          
          // Direct Link
          const isLinked = child.relatedItemIds?.includes(item.id) || item.relatedItemIds?.includes(child.id);
          
          // Category Match
          const isCategoryMatch = child.category === item.title;

          return isLinked || isCategoryMatch;
      });
  }, [item, allItems]);

  // Group Children by Type
  const childProjects = childrenItems.filter(i => i.type === ParaType.PROJECT);
  const childTasks = childrenItems.filter(i => i.type === ParaType.TASK);
  const childResources = childrenItems.filter(i => i.type === ParaType.RESOURCE);

  const getIcon = (type: ParaType) => {
      switch(type) {
          case ParaType.PROJECT: return <Folder className="w-5 h-5 text-red-500" />;
          case ParaType.AREA: return <Layers className="w-5 h-5 text-orange-500" />;
          case ParaType.TASK: return <CheckSquare className="w-5 h-5 text-emerald-500" />;
          default: return <FileText className="w-5 h-5 text-blue-500" />;
      }
  };

  const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
            <div className="flex-1 mr-4">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-500">
                        {item.type}
                    </span>
                    {item.category && (
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            {item.category}
                        </span>
                    )}
                </div>
                <h2 className={`text-xl font-bold text-slate-900 leading-tight ${item.isCompleted ? 'line-through text-slate-400' : ''}`}>
                    {item.title}
                </h2>
            </div>
            <div className="flex gap-2">
                <button onClick={() => onEdit(item.id)} className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-indigo-600 transition-colors border border-transparent hover:border-slate-200">
                    <Pencil className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            
            {/* 1. Parent Context */}
            {parentItem && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between group cursor-pointer hover:border-indigo-200 transition-colors" onClick={() => onNavigate(parentItem.id)}>
                    <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-slate-400 uppercase">Belongs to</div>
                        <div className="flex items-center gap-2 font-semibold text-slate-700">
                            {getIcon(parentItem.type)}
                            {parentItem.title}
                        </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                </div>
            )}

            {/* 2. Main Content */}
            {item.content && (
                <div className="prose prose-sm prose-slate max-w-none text-slate-600">
                    <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
            )}

            {/* 3. Attachments */}
            {item.attachments && item.attachments.length > 0 && (
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><PaperclipIcon className="w-3 h-3"/> Attachments</h4>
                    <div className="flex flex-wrap gap-2">
                        {item.attachments.map((url, i) => {
                            const isImg = isImageFile(url);
                            return (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                                   className={`flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors ${isImg ? 'pr-2' : ''}`}
                                >
                                    {isImg ? (
                                        <img src={url} className="w-8 h-8 rounded object-cover border border-slate-200" alt="attachment" />
                                    ) : (
                                        <FileText className="w-4 h-4 text-slate-500" />
                                    )}
                                    <span className="text-xs text-slate-600 truncate max-w-[150px]">File {i+1}</span>
                                    <ExternalLink className="w-3 h-3 text-slate-400" />
                                </a>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* 4. Children (For Areas/Projects) */}
            {(item.type === ParaType.AREA || item.type === ParaType.PROJECT) && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                    
                    {/* Projects List */}
                    {childProjects.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-2">
                                <Folder className="w-3 h-3" /> Projects inside
                            </h4>
                            <div className="grid gap-2">
                                {childProjects.map(child => (
                                    <div key={child.id} onClick={() => onNavigate(child.id)} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg hover:shadow-md hover:border-red-200 cursor-pointer transition-all">
                                        <span className="text-sm font-medium text-slate-700">{child.title}</span>
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tasks List */}
                    {childTasks.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-emerald-500 uppercase mb-2 flex items-center gap-2">
                                <CheckSquare className="w-3 h-3" /> Tasks inside
                            </h4>
                            <div className="grid gap-2">
                                {childTasks.map(child => (
                                    <div key={child.id} onClick={() => onNavigate(child.id)} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg hover:shadow-md hover:border-emerald-200 cursor-pointer transition-all">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${child.isCompleted ? 'bg-emerald-400' : 'bg-slate-300'}`}></div>
                                            <span className={`text-sm font-medium ${child.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                {child.title}
                                            </span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-300" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Empty State */}
                    {childProjects.length === 0 && childTasks.length === 0 && childResources.length === 0 && (
                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                            No items inside this {item.type.slice(0, -1)}.
                        </div>
                    )}
                </div>
            )}

            {/* Metadata Footer */}
            <div className="flex items-center gap-4 text-xs text-slate-400 pt-6 mt-auto">
                <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.createdAt).toLocaleDateString()}
                </div>
                {item.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {item.tags.join(', ')}
                    </div>
                )}
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
