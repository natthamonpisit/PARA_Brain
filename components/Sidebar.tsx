import React, { useRef } from 'react';
import { ParaType, AppModule } from '../types';
import { FolderKanban, LayoutGrid, Library, Archive, Box, Download, Upload, History, X, CheckSquare, Settings, Key, Wallet, Plus, Grid } from 'lucide-react';
import { getModuleIcon } from './DynamicModuleBoard';

interface SidebarProps {
  activeType: ParaType | 'All' | 'Finance' | string;
  onSelectType: (type: ParaType | 'All' | 'Finance' | string) => void;
  stats: Record<string, number>;
  onExport?: () => void;
  onImport?: (file: File) => void;
  onShowHistory: () => void;
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSetApiKey: (key: string) => void;
  // Dynamic Modules
  modules: AppModule[];
  onCreateModule: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeType, 
  onSelectType, 
  stats, 
  onExport, 
  onImport, 
  onShowHistory,
  isOpen,
  onClose,
  apiKey,
  onSetApiKey,
  modules,
  onCreateModule
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuItems = [
    { type: 'All', label: 'Dashboard', icon: Box, color: 'text-slate-500' },
    { type: ParaType.TASK, label: 'Tasks', icon: CheckSquare, color: 'text-emerald-500' },
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

  const handleMenuClick = (type: any) => {
      onSelectType(type);
      onClose();
  };

  const handleSetKey = () => {
    const newKey = window.prompt("Enter your Gemini API Key manually (it will be saved locally):", apiKey);
    if (newKey !== null) {
      onSetApiKey(newKey);
    }
  };

  const baseClasses = "w-64 h-full bg-white border-r border-slate-200 flex flex-col p-4 transition-transform duration-300 ease-in-out z-50";
  const mobileClasses = `fixed inset-y-0 left-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static`;

  return (
    <>
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
          <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-slate-600">
             <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="space-y-1 overflow-y-auto flex-1 pr-1 custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = activeType === item.type;
            const Icon = item.icon;
            const count = item.type === 'All' 
              ? Object.values(stats).reduce((a: number, b: number) => a + b, 0) 
              : stats[item.type as string] || 0;

            return (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item.type)}
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
          
          {/* MODULES SECTION */}
          <div className="pt-4 mt-2 border-t border-slate-100">
             <div className="flex justify-between items-center px-3 mb-2">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modules</p>
                 <button onClick={onCreateModule} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors">
                     <Plus className="w-3 h-3" />
                 </button>
             </div>
             
             {/* Built-in Finance */}
             <button
                onClick={() => handleMenuClick('Finance')}
                className={`
                  w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1
                  ${activeType === 'Finance'
                    ? 'bg-slate-100 text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                `}
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-indigo-600" />
                  <span>Finance</span>
                </div>
              </button>

              {/* Dynamic Modules */}
              {modules.map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => handleMenuClick(mod.id)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1
                      ${activeType === mod.id
                        ? 'bg-slate-100 text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {getModuleIcon(mod.icon, "w-5 h-5 text-indigo-500")}
                      <span>{mod.name}</span>
                    </div>
                  </button>
              ))}
          </div>
        </nav>

        {/* System Footer */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 shrink-0">
          <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">System</p>
          
          <button 
              onClick={handleSetKey}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <Key className={`w-4 h-4 ${apiKey ? 'text-green-500' : 'text-slate-400'}`} />
              {apiKey ? 'API Key Configured' : 'Set API Key'}
          </button>

          <button 
              onClick={() => { onShowHistory(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <History className="w-4 h-4 text-indigo-500" />
              History
          </button>

          <button 
              onClick={onExport}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <Download className="w-4 h-4" />
              Backup
          </button>

          <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
              <Upload className="w-4 h-4" />
              Restore
          </button>
          <input 
              type="file" 
              ref={fileInputRef}
              className="hidden"
              accept=".json"
              onChange={handleFileChange}
          />
        </div>
      </div>
    </>
  );
};