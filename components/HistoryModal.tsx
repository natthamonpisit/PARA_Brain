import React, { useState } from 'react';
import { HistoryLog, ParaType } from '../types';
import { X, Clock, PlusCircle, Trash2, Edit, Filter } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: HistoryLog[];
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, logs }) => {
  const [filterType, setFilterType] = useState<ParaType | 'All'>('All');

  if (!isOpen) return null;

  // Filter and Sort (Newest first)
  const filteredLogs = logs
    .filter(log => filterType === 'All' || log.itemType === filterType)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return <PlusCircle className="w-4 h-4 text-green-600" />;
      case 'DELETE': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'UPDATE': return <Edit className="w-4 h-4 text-blue-600" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getActionColor = (action: string) => {
      switch (action) {
        case 'CREATE': return 'bg-green-50 border-green-200 text-green-700';
        case 'DELETE': return 'bg-red-50 border-red-200 text-red-700';
        case 'UPDATE': return 'bg-blue-50 border-blue-200 text-blue-700';
        default: return 'bg-slate-50 border-slate-200 text-slate-700';
      }
  };

  const tabs = ['All', ...Object.values(ParaType)];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
                <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-900">Activity History</h2>
                <p className="text-xs text-slate-500">Track changes across your PARA system</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
                <button
                    key={tab}
                    onClick={() => setFilterType(tab as any)}
                    className={`
                        px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border
                        ${filterType === tab 
                            ? 'bg-slate-800 text-white border-slate-800' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}
                    `}
                >
                    {tab}
                </button>
            ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
            {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Filter className="w-12 h-12 mb-3 opacity-20" />
                    <p>No history found for this filter.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Date Grouping Logic could go here, keeping simple for now */}
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="flex gap-4 group">
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full bg-slate-300 mt-2 ring-4 ring-white group-hover:bg-indigo-400 transition-colors"></div>
                                <div className="w-px h-full bg-slate-200 my-1"></div>
                            </div>
                            <div className="flex-1 pb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${getActionColor(log.action)}`}>
                                        {getActionIcon(log.action)}
                                        {log.action}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group-hover:border-indigo-200 group-hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-semibold text-slate-800">{log.itemTitle}</p>
                                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                            {log.itemType}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
        
      </div>
    </div>
  );
};
