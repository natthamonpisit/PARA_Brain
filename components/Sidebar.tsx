import React from 'react';
import { ParaType } from '../types';
import { FolderKanban, LayoutGrid, Library, Archive, Box } from 'lucide-react';

interface SidebarProps {
  activeType: ParaType | 'All';
  onSelectType: (type: ParaType | 'All') => void;
  stats: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeType, onSelectType, stats }) => {
  
  const menuItems = [
    { type: 'All', label: 'Dashboard', icon: Box, color: 'text-slate-500' },
    { type: ParaType.PROJECT, label: 'Projects', icon: FolderKanban, color: 'text-red-500' },
    { type: ParaType.AREA, label: 'Areas', icon: LayoutGrid, color: 'text-orange-500' },
    { type: ParaType.RESOURCE, label: 'Resources', icon: Library, color: 'text-blue-500' },
    { type: ParaType.ARCHIVE, label: 'Archives', icon: Archive, color: 'text-gray-500' },
  ];

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col p-4 fixed left-0 top-0 hidden md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold">
          P
        </div>
        <h1 className="font-bold text-lg tracking-tight text-slate-900">PARA Brain</h1>
      </div>

      <nav className="space-y-1">
        {menuItems.map((item) => {
          const isActive = activeType === item.type;
          const Icon = item.icon;
          // JAY'S NOTE: Explicitly type accumulator and current value to fix TS error
          const count = item.type === 'All' 
            ? Object.values(stats).reduce((a: number, b: number) => a + b, 0) 
            : stats[item.type as string] || 0;

          return (
            <button
              key={item.label}
              onClick={() => onSelectType(item.type as any)}
              className={`
                w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-slate-100 text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
              `}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span>{item.label}</span>
              </div>
              {count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="px-3 py-2 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-900 mb-1">AI Assistant Ready</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Type anything below. I'll organize it into Projects, Areas, or Resources for you.
          </p>
        </div>
      </div>
    </div>
  );
};