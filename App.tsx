
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ParaBoard } from './components/ParaBoard';
import { FinanceBoard } from './components/FinanceBoard'; 
import { DynamicModuleBoard } from './components/DynamicModuleBoard'; 
import { ModuleBuilderModal } from './components/ModuleBuilderModal'; 
import { HistoryModal } from './components/HistoryModal'; 
import { ManualEntryModal } from './components/ManualEntryModal';
import { ParaType, AppModule, ModuleItem } from './types';
import { CheckCircle2, AlertCircle, Loader2, Menu, LayoutDashboard, MessageSquare, Plus } from 'lucide-react';
import { useParaData } from './hooks/useParaData';
import { useFinanceData } from './hooks/useFinanceData'; // NEW
import { useModuleData } from './hooks/useModuleData'; // NEW
import { useAIChat } from './hooks/useAIChat';

type MobileTab = 'board' | 'chat';

export default function App() {
  // --- CORE HOOKS ---
  const { 
    items, historyLogs, isLoadingDB, deleteItem, toggleComplete, exportData, importData, addItem
  } = useParaData();

  const {
      accounts, transactions, loadFinanceData, addTransaction, addAccount
  } = useFinanceData();

  const {
      modules, moduleItems, loadModules, loadModuleItems, createModule, addModuleItem, deleteModuleItem
  } = useModuleData();

  // --- UI STATE ---
  const [activeType, setActiveType] = useState<ParaType | 'All' | 'Finance' | string>('All');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isModuleBuilderOpen, setIsModuleBuilderOpen] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // --- INITIAL LOAD ---
  useEffect(() => {
    const savedKey = localStorage.getItem('para_ai_key');
    if (savedKey) setApiKey(savedKey);
    loadFinanceData();
    loadModules();
  }, []); // Run once

  // --- VIEW LOGIC ---
  useEffect(() => {
      // If active type is a module ID, load its items
      if (typeof activeType === 'string' && !['All', 'Finance', ...Object.values(ParaType)].includes(activeType as any)) {
          loadModuleItems(activeType);
      }
  }, [activeType]);

  const handleSetApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('para_ai_key', key);
  };

  // --- AI INTEGRATION ---
  const { messages, isProcessing, handleSendMessage, handleChatCompletion } = useAIChat({
    items, 
    accounts,
    modules,
    onAddItem: addItem, 
    onToggleComplete: toggleComplete, 
    onAddTransaction: addTransaction,
    onAddModuleItem: addModuleItem,
    apiKey
  });
  
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteWrapper = async (id: string) => {
    if (!window.confirm('Delete this item?')) return;
    try {
        if (typeof activeType === 'string' && !['All', 'Finance', ...Object.values(ParaType)].includes(activeType as any)) {
            await deleteModuleItem(id, activeType);
        } else {
            await deleteItem(id);
        }
    } catch { showNotification('Failed to delete', 'error'); }
  };

  const handleManualSave = async (data: any, mode: 'PARA' | 'TRANSACTION' | 'ACCOUNT' | 'MODULE') => {
      try {
          if (mode === 'PARA') await addItem(data);
          else if (mode === 'TRANSACTION') await addTransaction(data);
          else if (mode === 'ACCOUNT') await addAccount(data);
          else if (mode === 'MODULE') await addModuleItem(data);
          
          showNotification('Saved successfully', 'success');
      } catch (e) {
          console.error(e);
          showNotification('Failed to save', 'error');
      }
  };

  const handleCreateModule = async (newModule: AppModule) => {
      try {
          await createModule(newModule);
          showNotification(`Module '${newModule.name}' created!`, 'success');
          setActiveType(newModule.id);
      } catch (e) {
          showNotification('Failed to create module', 'error');
      }
  };

  // Determine current view details
  const activeModule = modules.find(m => m.id === activeType);
  const pageTitle = activeModule ? activeModule.name : (activeType === 'All' ? 'Dashboard' : activeType);

  if (isLoadingDB) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      <Sidebar 
        activeType={activeType} onSelectType={setActiveType}
        stats={items.reduce((acc, i) => ({...acc, [i.type]: (acc[i.type]||0)+1}), {} as any)}
        onExport={exportData} onImport={(f) => importData(f).then(() => showNotification('Restored!', 'success'))}
        onShowHistory={() => setIsHistoryOpen(true)}
        isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}
        apiKey={apiKey} onSetApiKey={handleSetApiKey}
        modules={modules} onCreateModule={() => setIsModuleBuilderOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600"><Menu className="w-6 h-6" /></button>
             <span className="font-bold">{pageTitle}</span>
          </div>
          <button onClick={() => setIsManualModalOpen(true)} className="p-2 bg-indigo-600 text-white rounded-full"><Plus className="w-5 h-5" /></button>
        </div>

        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md border-b px-8 py-4 justify-between items-center shrink-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{pageTitle}</h2>
          <div className="flex items-center gap-4">
            {notification && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium animate-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {notification.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {notification.message}
                </div>
            )}
            <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 shadow-sm">
              <Plus className="w-3.5 h-3.5" />
              New Item
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
            <div className={`h-full w-full overflow-y-auto p-4 md:p-8 ${mobileTab === 'board' ? 'block' : 'hidden md:block'}`}>
                <div className="w-full pb-24 md:pb-0">
                    {activeModule ? (
                        <DynamicModuleBoard 
                            module={activeModule}
                            items={moduleItems[activeModule.id] || []}
                            onDelete={handleDeleteWrapper}
                        />
                    ) : activeType === 'Finance' ? (
                        <FinanceBoard accounts={accounts} transactions={transactions} projects={items.filter(i => i.type === ParaType.PROJECT)} />
                    ) : (
                        <ParaBoard items={items} activeType={activeType as any} onDelete={handleDeleteWrapper} onToggleComplete={(id, s) => toggleComplete(id, s)} />
                    )}
                </div>
            </div>
            {/* Mobile Chat View */}
            <div className={`h-full w-full absolute inset-0 bg-white z-30 pb-14 ${mobileTab === 'chat' ? 'block' : 'hidden'} md:hidden`}>
               <ChatPanel messages={messages} onSendMessage={handleSendMessage} onCompleteTask={handleChatCompletion} isProcessing={isProcessing} className="w-full h-full" />
            </div>
        </div>
      </div>

      <div className="hidden md:block"><ChatPanel messages={messages} onSendMessage={handleSendMessage} onCompleteTask={handleChatCompletion} isProcessing={isProcessing} className="w-96" /></div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t flex justify-around items-center z-50 safe-area-bottom">
        <button onClick={() => setMobileTab('board')} className={`flex flex-col items-center gap-0.5 p-1 ${mobileTab === 'board' ? 'text-indigo-600' : 'text-slate-400'}`}><LayoutDashboard className="w-5 h-5" /><span className="text-[9px] font-semibold">Board</span></button>
        <button onClick={() => setMobileTab('chat')} className={`flex flex-col items-center gap-0.5 p-1 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}><MessageSquare className="w-5 h-5" /><span className="text-[9px] font-semibold">Chat</span></button>
      </div>

      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} logs={historyLogs} />
      
      <ManualEntryModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSave={handleManualSave}
        defaultType={activeType}
        projects={items.filter(i => i.type === ParaType.PROJECT)}
        accounts={accounts}
        activeModule={activeModule || null}
      />

      <ModuleBuilderModal 
        isOpen={isModuleBuilderOpen}
        onClose={() => setIsModuleBuilderOpen(false)}
        onSave={handleCreateModule}
      />
    </div>
  );
}
