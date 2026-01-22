import React, { useRef } from 'react';
import { ParaType } from '../types';
import { FolderKanban, LayoutGrid, Library, Archive, Box, Download, Upload, History, X } from 'lucide-react';

interface SidebarProps {
  activeType: ParaType | 'All';
  onSelectType: (type: ParaType | 'All') => void;
  stats: Record<string, number>;
  onExport?: () => void;
  onImport?: (file: File) => void;
  onShowHistory: () => void;
  // JAY'S NOTE: Props for Mobile Drawer Control
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeType, 
  onSelectType, 
  stats, 
  onExport, 
  onImport, 
  onShowHistory,
  isOpen,
  onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuItems = [
    { type: 'All', label: 'Dashboard', icon: Box, color: 'text-slate-500' },
    { type: ParaType.PROJECT, label: 'Projects', icon: FolderKanban, color: 'text-red-500' },
    { type: ParaType.AREA, label: 'Areas', icon: LayoutGrid, color: 'text-orange-500' },
    { type: ParaType.RESOURCE, label: 'Resources', icon: Library, color: 'text-blue-500' },
    { type: ParaType.ARCHIVE, label: 'Archives', icon: Archive, color: 'text-gray-500' },
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImport) {
      onImport(file);
    }
    if (event.target) event.target.value = '';
  };

  const handleMenuClick = (type: ParaType | 'All') => {
      onSelectType(type);
      onClose(); // Close drawer on mobile selection
  };

  // Base classes for the sidebar container
  const baseClasses = "w-64 h-full bg-white border-r border-slate-200 flex flex-col p-4 transition-transform duration-300 ease-in-out z-50";
  // Mobile specific: fixed position, slide-in logic
  const mobileClasses = `fixed inset-y-0 left-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
            className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
            onClick={onClose}
        />
      )}

      <div className={`${baseClasses} ${mobileClasses}`}>
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold">
              P
            </div>
            <h1 className="font-bold text-lg tracking-tight text-slate-900">PARA Brain</h1>
          </div>
          {/* Close button for mobile */}
          <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-slate-600">
             <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = activeType === item.type;
            const Icon = item.icon;
            const count = item.type === 'All' 
              ? Object.values(stats).reduce((a: number, b: number) => a + b, 0) 
              : stats[item.type as string] || 0;

            return (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item.type as any)}
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

        {/* Data Management Section */}
        <div className="mt-auto pt-4 border-t border-slate-100 space-y-2">
          <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">System</p>
          
          <button 
              onClick={() => { onShowHistory(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <History className="w-4 h-4 text-indigo-500" />
              Activity History
          </button>

          <button 
              onClick={onExport}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <Download className="w-4 h-4" />
              Backup Data
          </button>

          <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <Upload className="w-4 h-4" />
              Restore Backup
          </button>
          <input 
              type="file" 
              ref={fileInputRef}
              className="hidden"
              accept=".json"
              onChange={handleFileChange}
          />
          
          <div className="mt-4 px-3 py-2 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 md:block hidden">
            <p className="text-xs font-semibold text-indigo-900 mb-1">AI Assistant Ready</p>
            <p className="text-xs text-indigo-600 leading-relaxed">
              Type anything below. I'll organize it for you.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
