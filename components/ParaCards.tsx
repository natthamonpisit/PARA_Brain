
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Calendar, Tag, Link2, CheckSquare, Square, Trash2, FileText, ExternalLink, Archive, Pencil, Book } from 'lucide-react';
import { ParaItem, ParaType } from '../types';

// Helper
const isImageFile = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(url);

interface CardProps {
    item: ParaItem;
    onDelete: (id: string) => void;
    onArchive: (id: string) => void;
    onToggleComplete?: (id: string, status: boolean) => void;
    onEdit?: (id: string) => void;
    onClick?: (id: string) => void;
    allItemsMap?: Record<string, ParaItem>;
    isSelected: boolean;
    childResources?: ParaItem[]; // New Prop: Resources that belong to this item
}

export const TaskCard: React.FC<CardProps> = ({ 
    item, onDelete, onArchive, onToggleComplete, onEdit, onClick, allItemsMap = {}, isSelected 
}) => {
    return (
        <div 
            onClick={(e) => {
                // Prevent modal opening when clicking controls
                if ((e.target as HTMLElement).closest('button, a, input')) return;
                onClick && onClick(item.id);
            }}
            className={`
                group bg-white rounded-xl border p-4 transition-all duration-200 flex flex-col h-full cursor-pointer
                ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : ''}
                ${item.isCompleted 
                    ? 'border-slate-100 opacity-60 bg-slate-50' 
                    : 'border-emerald-100 hover:shadow-md hover:border-emerald-200'}
            `}
        >
            <div className="flex items-start gap-3 pl-6"> 
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleComplete && onToggleComplete(item.id, !!item.isCompleted);
                    }}
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
                    
                    {/* Resource List (Attachments) - Bottom Left */}
                    {item.attachments && item.attachments.length > 0 && (
                         <div className="mt-2 flex flex-wrap gap-2">
                             {item.attachments.map((url, i) => {
                                 const isImg = isImageFile(url);
                                 return (
                                     <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                                        className={`
                                            relative rounded border border-slate-200 overflow-hidden shrink-0 hover:ring-2 ring-indigo-500
                                            ${isImg ? 'w-8 h-8' : 'flex items-center gap-1 px-1.5 py-1 bg-slate-50 text-[9px]'}
                                        `}
                                        title="View Attachment"
                                        onClick={(e) => e.stopPropagation()}
                                     >
                                         {isImg ? (
                                             <img src={url} alt="attachment" className="w-full h-full object-cover" />
                                         ) : (
                                             <>
                                                 <FileText className="w-3 h-3 text-indigo-500" />
                                                 <span className="max-w-[60px] truncate text-slate-600">File {i+1}</span>
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
                                <button onClick={(e) => { e.stopPropagation(); onEdit(item.id); }} className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-indigo-500" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {item.type !== ParaType.ARCHIVE && (
                                <button onClick={(e) => { e.stopPropagation(); onArchive(item.id); }} className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-slate-600" title="Archive">
                                    <Archive className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ParaCard: React.FC<CardProps> = ({ 
    item, onDelete, onArchive, onEdit, onClick, allItemsMap, isSelected, childResources
}) => {
  
  const typeColors = {
    [ParaType.PROJECT]: 'bg-red-50 text-red-700 border-red-100',
    [ParaType.AREA]: 'bg-orange-50 text-orange-700 border-orange-100',
    [ParaType.RESOURCE]: 'bg-blue-50 text-blue-700 border-blue-100',
    [ParaType.ARCHIVE]: 'bg-gray-50 text-gray-700 border-gray-100',
    [ParaType.TASK]: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };

  return (
    <div 
        onClick={(e) => {
            // Prevent modal opening when clicking controls
            if ((e.target as HTMLElement).closest('button, a')) return;
            onClick && onClick(item.id);
        }}
        className={`
            group bg-white rounded-xl border p-5 hover:shadow-lg transition-all duration-200 relative flex flex-col h-full pl-8 cursor-pointer
            ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-slate-200'}
        `}
    >
      <div className="flex justify-between items-start mb-3">
        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${typeColors[item.type]}`}>
          {item.type}
        </span>
        
        {/* Hover Actions */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4 bg-white shadow-sm border rounded-lg p-1">
             {onEdit && (
                <button onClick={(e) => { e.stopPropagation(); onEdit(item.id); }} className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-indigo-500" title="Edit">
                    <Pencil className="w-4 h-4" />
                </button>
             )}
             {item.type !== ParaType.ARCHIVE && (
                <button onClick={(e) => { e.stopPropagation(); onArchive(item.id); }} className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-600" title="Archive">
                    <Archive className="w-4 h-4" />
                </button>
             )}
             <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
             </button>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2 leading-tight">{item.title}</h3>
      
      <div className="prose prose-sm prose-slate mb-4 line-clamp-4 flex-1 text-slate-600">
        <ReactMarkdown>{item.content}</ReactMarkdown>
      </div>

      {/* Relations Section (Parents) */}
      {item.relatedItemIds && item.relatedItemIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
            {item.relatedItemIds.map(relId => {
                const relItem = allItemsMap ? allItemsMap[relId] : null;
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
      
      {/* --- RESOURCE LIST (Bottom Left) --- */}
      {/* Combines Attachments AND Linked Child Resources */}
      {( (item.attachments && item.attachments.length > 0) || (childResources && childResources.length > 0) ) && (
         <div className="mt-auto mb-4 pt-3 border-t border-slate-50">
             <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Resources</div>
             <div className="flex flex-wrap gap-2">
                 
                 {/* 1. Linked Child Resources (e.g. Playlist in Wedding Project) */}
                 {childResources && childResources.map(res => (
                     <div key={res.id} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100">
                         <Book className="w-3 h-3" />
                         <span className="max-w-[100px] truncate">{res.title}</span>
                     </div>
                 ))}

                 {/* 2. Direct Attachments */}
                 {item.attachments && item.attachments.map((url, i) => {
                     const isImg = isImageFile(url);
                     return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" 
                           className={`
                             flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200 hover:text-indigo-600 border border-slate-200 transition-colors
                           `}
                           onClick={(e) => e.stopPropagation()}
                        >
                            {isImg ? <div className="w-3 h-3 rounded-full bg-purple-400"></div> : <FileText className="w-3 h-3" />}
                            <span className="max-w-[80px] truncate">{isImg ? `Image ${i+1}` : `File ${i+1}`}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                        </a>
                     );
                 })}
             </div>
         </div>
      )}

      <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-50">
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
