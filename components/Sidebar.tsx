
import React, { useRef, useState } from 'react';
import { ParaType, AppModule } from '../types';
import { FolderKanban, LayoutGrid, Library, Archive, Box, History, X, CheckSquare, Wallet, Plus, ChevronRight, PanelLeftClose, MessageCircle, BrainCircuit, ClipboardCheck, Target, Newspaper } from 'lucide-react';
import { getModuleIcon } from './DynamicModuleBoard';

interface SidebarProps {
  activeType: ParaType | 'All' | 'LifeOverview' | 'ThailandPulse' | 'Finance' | 'Review' | 'Agent' | string;
  onSelectType: (type: ParaType | 'All' | 'LifeOverview' | 'ThailandPulse' | 'Finance' | 'Review' | 'Agent' | string) => void;
  stats: Record<string, number>;
  onExport?: () => void;
  onImport?: (file: File) => void;
  onShowHistory: () => void;
  isOpen: boolean;
  onClose: () => void;
  // Dynamic Modules
  modules: AppModule[];
  onCreateModule: () => void;
  // Messaging Integration
  onOpenTelegram: () => void;
  // NEW: Analysis
  onAnalyzeLife: () => void;
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
  modules,
  onCreateModule,
  onOpenTelegram,
  onAnalyzeLife
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { type: 'All', label: 'Mission', icon: Box, color: 'text-cyan-300' },
    { type: 'LifeOverview', label: 'Life Overview', icon: Target, color: 'text-cyan-200' },
    { type: 'ThailandPulse', label: 'Thailand Pulse', icon: Newspaper, color: 'text-sky-300' },
    { type: 'Agent', label: 'Agent', icon: BrainCircuit, color: 'text-indigo-600' },
    { type: 'Review', label: 'Review', icon: ClipboardCheck, color: 'text-violet-500' },
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
      // On mobile, close sidebar on select
      if (window.innerWidth < 768) {
        onClose();
      }
  };

  // Width logic: Mobile uses full width/overlay. Desktop uses dynamic width.
  const desktopWidthClass = isCollapsed ? 'md:w-20' : 'md:w-64';
  const baseClasses = `h-full bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out z-50 fixed inset-y-0 left-0 w-64 ${desktopWidthClass} md:static`;
  const mobileClasses = isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0';

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
        
        {/* Header */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} h-16 px-4 border-b border-slate-800 shrink-0`}>
          {!isCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 bg-cyan-500/15 border border-cyan-400/50 rounded-lg flex items-center justify-center text-cyan-200 font-bold shrink-0">
                P
              </div>
              <h1 className="font-bold text-lg tracking-tight text-slate-100 truncate">PARA Brain</h1>
            </div>
          )}
          
          {/* Collapsed State Logo (Only P) */}
          {isCollapsed && (
             <div className="w-8 h-8 bg-cyan-500/15 border border-cyan-400/50 rounded-lg flex items-center justify-center text-cyan-200 font-bold shrink-0">
                P
             </div>
          )}

          {/* Toggle Button (Desktop Only) */}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden md:flex p-1.5 rounded-lg text-slate-500 hover:bg-slate-900 hover:text-slate-200 transition-colors ${isCollapsed ? 'absolute -right-3 top-6 bg-slate-900 border border-slate-700 shadow-sm rounded-full scale-75' : ''}`}
          >
             {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* Close Button (Mobile Only) */}
          <button onClick={onClose} className="md:hidden p-1 text-slate-500 hover:text-slate-200">
             <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Nav Area */}
        <nav className="space-y-1 overflow-y-auto flex-1 p-2 custom-scrollbar">
          {menuItems.map((item) => {
            const isActive = activeType === item.type;
            const Icon = item.icon;
            const count = item.type === 'All' 
              ? Object.values(stats).reduce((a: number, b: number) => a + b, 0) 
              : item.type === 'LifeOverview'
                ? stats[ParaType.AREA as string] || 0
              : stats[item.type as string] || 0;

            return (
              <button
                key={item.label}
                onClick={() => handleMenuClick(item.type)}
                title={isCollapsed ? item.label : ''}
                className={`
                  w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                  ${isActive 
                    ? 'bg-cyan-500/12 text-cyan-200 shadow-sm border border-cyan-400/35' 
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}
                `}
              >
                <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>
                {!isCollapsed && count > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-cyan-500/15 text-cyan-100 shadow-sm' : 'bg-slate-900 text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          
          {/* MODULES SECTION */}
          <div className={`pt-4 mt-2 border-t border-slate-800 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
             {!isCollapsed ? (
                <div className="flex justify-between items-center px-3 mb-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modules</p>
                    <button onClick={onCreateModule} className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-cyan-300 transition-colors">
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
             ) : (
                 <div className="w-4 h-px bg-slate-700 mb-4"></div>
             )}
             
             {/* Built-in Finance */}
             <button
                onClick={() => handleMenuClick('Finance')}
                title={isCollapsed ? "Finance" : ''}
                className={`
                  w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1
                  ${activeType === 'Finance'
                    ? 'bg-cyan-500/12 text-cyan-200 shadow-sm border border-cyan-400/35' 
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}
                `}
              >
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-indigo-600" />
                  {!isCollapsed && <span>Finance</span>}
                </div>
              </button>

              {/* Dynamic Modules */}
              {modules.map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => handleMenuClick(mod.id)}
                    title={isCollapsed ? mod.name : ''}
                    className={`
                      w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-1
                      ${activeType === mod.id
                        ? 'bg-cyan-500/12 text-cyan-200 shadow-sm border border-cyan-400/35' 
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {getModuleIcon(mod.icon, "w-5 h-5 text-indigo-500")}
                      {!isCollapsed && <span>{mod.name}</span>}
                    </div>
                  </button>
              ))}
              
              {/* Add Button in collapsed mode */}
              {isCollapsed && (
                 <button onClick={onCreateModule} className="mt-2 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 text-slate-500 hover:text-cyan-300 hover:bg-slate-800 transition-colors" title="Create Module">
                    <Plus className="w-4 h-4" />
                 </button>
              )}
          </div>
        </nav>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/95 space-y-1">
          
          {/* Analyze Life Button (Highlighted) */}
          <button
            onClick={onAnalyzeLife}
            title={isCollapsed ? "AI Life Analysis" : ''}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md hover:opacity-90 transition-all mb-2`}
          >
             <BrainCircuit className="w-5 h-5" />
             {!isCollapsed && <span>Analyze My Life</span>}
          </button>

          <button
            onClick={onOpenTelegram}
            title={isCollapsed ? "Connect Telegram" : ''}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-[#229ED9] transition-colors`}
          >
             <MessageCircle className="w-5 h-5" />
             {!isCollapsed && <span>Connect Telegram</span>}
          </button>

          <button
            onClick={onShowHistory}
            title={isCollapsed ? "History" : ''}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start gap-3 px-3'} py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-slate-100 transition-colors`}
          >
            <History className="w-5 h-5" />
            {!isCollapsed && <span>History</span>}
          </button>

        </div>

      </div>
      
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".json"
      />
    </>
  );
};
