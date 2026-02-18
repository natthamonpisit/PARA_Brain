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
      case 'CREATE': return <PlusCircle className="w-4 h-4 text-green-400" />;
      case 'DELETE': return <Trash2 className="w-4 h-4 text-red-400" />;
      case 'UPDATE': return <Edit className="w-4 h-4 text-blue-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getActionColor = (action: string) => {
      switch (action) {
        case 'CREATE': return 'bg-green-500/10 border-green-500/30 text-green-400';
        case 'DELETE': return 'bg-red-500/10 border-red-500/30 text-red-400';
        case 'UPDATE': return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
        default: return 'bg-slate-700 border-slate-600 text-slate-400';
      }
  };

  const tabs = ['All', ...Object.values(ParaType)];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-700">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/15 border border-cyan-400/30 rounded-lg">
                <Clock className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-100">Activity History</h2>
                <p className="text-xs text-slate-400">Track changes across your PARA system</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-6 py-3 border-b border-slate-700 flex gap-2 overflow-x-auto no-scrollbar bg-slate-800/50">
            {tabs.map(tab => (
                <button
                    key={tab}
                    onClick={() => setFilterType(tab as any)}
                    className={`
                        px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border
                        ${filterType === tab
                            ? 'bg-slate-700 text-cyan-200 border-slate-600'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'}
                    `}
                >
                    {tab}
                </button>
            ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
            {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Filter className="w-12 h-12 mb-3 opacity-20" />
                    <p>No history found for this filter.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="flex gap-4 group">
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full bg-slate-600 mt-2 ring-4 ring-slate-900 group-hover:bg-cyan-400 transition-colors"></div>
                                <div className="w-px h-full bg-slate-700 my-1"></div>
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
                                <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 shadow-sm group-hover:border-cyan-500/40 transition-all">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-semibold text-slate-200">{log.itemTitle}</p>
                                        <span className="text-[10px] text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
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
