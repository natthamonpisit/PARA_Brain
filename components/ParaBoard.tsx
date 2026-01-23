
import React from 'react';
import { ParaItem, ParaType, ViewMode } from '../types';
import ReactMarkdown from 'react-markdown';
import { Calendar, Tag, MoreHorizontal, Link2, CheckSquare, Square, Edit, Trash2 } from 'lucide-react';

interface ParaBoardProps {
  items: ParaItem[];
  activeType: ParaType | 'All';
  viewMode: ViewMode;
  onDelete: (id: string) => void;
  onToggleComplete?: (id: string, currentStatus: boolean) => void;
  allItemsMap?: Record<string, ParaItem>; 
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
    onToggleComplete,
    allItemsMap = {},
    selectedIds,
    onSelect,
    onSelectAll
}) => {
  
  const displayItems = activeType === 'All' 
    ? items 
    : items.filter(i => i.type === activeType);

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
        <p className="text-lg font-medium">No items yet</p>
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
                            onToggleComplete={onToggleComplete}
                            allItemsMap={allItemsMap}
                            isSelected={selectedIds.has(item.id)}
                        />
                    ) : (
                        <Card 
                            item={item} 
                            onDelete={onDelete} 
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

const TaskCard: React.FC<{
    item: ParaItem;
    onDelete: (id: string) => void;
    onToggleComplete?: (id: string, status: boolean) => void;
    allItemsMap: Record<string, ParaItem>;
    isSelected: boolean;
}> = ({ item, onDelete, onToggleComplete, allItemsMap, isSelected }) => {
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

                    <div className="flex items-center justify-between mt-auto pt-2">
                         <span className="text-[10px] text-slate-400">
                            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                         </span>
                         {/* Hover Actions */}
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
  allItemsMap: Record<string, ParaItem>;
  isSelected: boolean;
}> = ({ item, onDelete, allItemsMap, isSelected }) => {
  
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
             <button onClick={() => onDelete(item.id)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
             </button>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mb-2 leading-tight">{item.title}</h3>
      
      <div className="prose prose-sm prose-slate mb-4 line-clamp-4 flex-1 text-slate-600">
        <ReactMarkdown>{item.content}</ReactMarkdown>
      </div>
      
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
