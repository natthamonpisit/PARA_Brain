
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
    childResources?: ParaItem[];
}

export const TaskCard: React.FC<CardProps> = ({
    item, onDelete, onArchive, onToggleComplete, onEdit, onClick, allItemsMap = {}, isSelected
}) => {
    return (
        <div
            onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a, input')) return;
                onClick && onClick(item.id);
            }}
            className={`
                group bg-slate-900/80 rounded-lg border p-3 transition-all duration-200 flex flex-col h-full cursor-pointer
                ${isSelected ? 'border-cyan-500 ring-1 ring-cyan-500 bg-cyan-500/5' : ''}
                ${item.isCompleted
                    ? 'border-slate-700/50 opacity-60'
                    : 'border-slate-700 hover:border-emerald-500/40'}
            `}
        >
            <div className="flex items-start gap-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleComplete && onToggleComplete(item.id, !!item.isCompleted);
                    }}
                    className={`mt-0.5 flex-shrink-0 transition-colors ${item.isCompleted ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'}`}
                >
                    {item.isCompleted ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-sm text-slate-100 leading-tight ${item.isCompleted ? 'line-through text-slate-500' : ''}`}>
                        {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                        <ReactMarkdown>{item.content}</ReactMarkdown>
                    </p>

                    {item.relatedItemIds && item.relatedItemIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {item.relatedItemIds.map(relId => {
                                const relItem = allItemsMap[relId];
                                if (!relItem) return null;
                                return (
                                    <span key={relId} className="flex items-center gap-1 text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 truncate max-w-full">
                                        <Link2 className="w-2.5 h-2.5" />
                                        <span className="truncate">{relItem.title}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                         <div className="mt-1.5 flex flex-wrap gap-1.5">
                             {item.attachments.map((url, i) => {
                                 const isImg = isImageFile(url);
                                 return (
                                     <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                        className={`
                                            relative rounded border border-slate-700 overflow-hidden shrink-0 hover:ring-2 ring-cyan-500
                                            ${isImg ? 'w-7 h-7' : 'flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-[9px]'}
                                        `}
                                        title="View Attachment"
                                        onClick={(e) => e.stopPropagation()}
                                     >
                                         {isImg ? (
                                             <img src={url} alt="attachment" className="w-full h-full object-cover" />
                                         ) : (
                                             <>
                                                 <FileText className="w-3 h-3 text-cyan-400" />
                                                 <span className="max-w-[60px] truncate text-slate-400">File {i+1}</span>
                                             </>
                                         )}
                                     </a>
                                 );
                             })}
                         </div>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-1.5">
                         <span className="text-[10px] text-slate-500">
                            {item.dueDate ? `Due: ${new Date(item.dueDate).toLocaleDateString()}` : new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                         </span>
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onEdit && (
                                <button onClick={(e) => { e.stopPropagation(); onEdit(item.id); }} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-cyan-400" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {item.type !== ParaType.ARCHIVE && (
                                <button onClick={(e) => { e.stopPropagation(); onArchive(item.id); }} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300" title="Archive">
                                    <Archive className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 hover:bg-rose-900/30 rounded text-slate-500 hover:text-rose-400">
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
    [ParaType.PROJECT]: 'bg-red-900/30 text-red-400 border-red-800',
    [ParaType.AREA]: 'bg-orange-900/30 text-orange-400 border-orange-800',
    [ParaType.RESOURCE]: 'bg-blue-900/30 text-blue-400 border-blue-800',
    [ParaType.ARCHIVE]: 'bg-gray-800 text-gray-400 border-gray-700',
    [ParaType.TASK]: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  };

  return (
    <div
        onClick={(e) => {
            if ((e.target as HTMLElement).closest('button, a')) return;
            onClick && onClick(item.id);
        }}
        className={`
            group bg-slate-900/80 rounded-lg border p-3 transition-all duration-200 relative flex flex-col h-full cursor-pointer
            ${isSelected ? 'border-cyan-500 ring-1 ring-cyan-500 bg-cyan-500/5' : 'border-slate-700'}
            hover:border-cyan-400/40
        `}
    >
      <div className="flex justify-between items-start mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${typeColors[item.type]}`}>
          {item.type}
        </span>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 bg-slate-800 shadow-sm border border-slate-700 rounded-lg p-1">
             {onEdit && (
                <button onClick={(e) => { e.stopPropagation(); onEdit(item.id); }} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-cyan-400" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                </button>
             )}
             {item.type !== ParaType.ARCHIVE && (
                <button onClick={(e) => { e.stopPropagation(); onArchive(item.id); }} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200" title="Archive">
                    <Archive className="w-3.5 h-3.5" />
                </button>
             )}
             <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="p-1 hover:bg-rose-900/30 rounded text-slate-400 hover:text-rose-400">
                <Trash2 className="w-3.5 h-3.5" />
             </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-100 mb-1 leading-tight">{item.title}</h3>

      <div className="prose prose-sm prose-invert mb-2 line-clamp-3 flex-1 text-slate-400 text-xs">
        <ReactMarkdown>{item.content}</ReactMarkdown>
      </div>

      {item.relatedItemIds && item.relatedItemIds.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
            {item.relatedItemIds.map(relId => {
                const relItem = allItemsMap ? allItemsMap[relId] : null;
                if (!relItem) return null;
                return (
                    <div key={relId} className="flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 max-w-full truncate">
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{relItem.title}</span>
                    </div>
                );
            })}
        </div>
      )}

      {( (item.attachments && item.attachments.length > 0) || (childResources && childResources.length > 0) ) && (
         <div className="mt-auto mb-2 pt-2 border-t border-slate-700/50">
             <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Resources</div>
             <div className="flex flex-wrap gap-1.5">
                 {childResources && childResources.map(res => (
                     <div key={res.id} className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/20 text-blue-400 rounded text-[10px] border border-blue-800/50">
                         <Book className="w-3 h-3" />
                         <span className="max-w-[80px] truncate">{res.title}</span>
                     </div>
                 ))}

                 {item.attachments && item.attachments.map((url, i) => {
                     const isImg = isImageFile(url);
                     return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] hover:bg-slate-700 hover:text-cyan-400 border border-slate-700 transition-colors"
                           onClick={(e) => e.stopPropagation()}
                        >
                            {isImg ? <div className="w-2.5 h-2.5 rounded-full bg-purple-400"></div> : <FileText className="w-3 h-3" />}
                            <span className="max-w-[60px] truncate">{isImg ? `Img ${i+1}` : `File ${i+1}`}</span>
                            <ExternalLink className="w-2 h-2 opacity-50" />
                        </a>
                     );
                 })}
             </div>
         </div>
      )}

      <div className="pt-1.5 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-700/50">
        <div className="flex gap-2">
          {item.tags.slice(0, 2).map(tag => (
            <span key={tag} className="flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-2.5 h-2.5" />
          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
};
