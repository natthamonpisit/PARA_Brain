import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ParaBoard } from './components/ParaBoard';
import { HistoryModal } from './components/HistoryModal'; 
import { ParaType } from './types';
import { CheckCircle2, AlertCircle, Loader2, Menu, LayoutDashboard, MessageSquare } from 'lucide-react';
import { useParaData } from './hooks/useParaData';
import { useAIChat } from './hooks/useAIChat';

type MobileTab = 'board' | 'chat';

export default function App() {
  // 1. Data & Persistence Layer
  const { 
    items, 
    historyLogs, 
    isLoadingDB, 
    deleteItem, 
    toggleComplete, 
    exportData, 
    importData, 
    addItem 
  } = useParaData();

  // 2. API Key Management (Local State for Quick Fix)
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('para_ai_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleSetApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('para_ai_key', key);
  };

  // 3. AI & Chat Layer
  const { 
    messages, 
    isProcessing, 
    handleSendMessage, 
    handleChatCompletion 
  } = useAIChat({
    items,
    onAddItem: addItem,
    onToggleComplete: toggleComplete,
    apiKey // Pass the manual key
  });
  
  // 4. UI State Layer
  const [activeType, setActiveType] = useState<ParaType | 'All'>('All');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteWrapper = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteItem(id);
      } catch {
        showNotification('Failed to delete', 'error');
      }
    }
  };

  const handleToggleCompleteWrapper = async (id: string, currentStatus: boolean) => {
    try {
      const updated = await toggleComplete(id, currentStatus);
      showNotification(updated.isCompleted ? 'Task completed!' : 'Task reopened', 'success');
    } catch {
      showNotification('Failed to update task', 'error');
    }
  };

  const handleImportWrapper = async (file: File) => {
    if (!window.confirm('This will REPLACE all current data. Continue?')) {
        return;
    }
    try {
        await importData(file);
        showNotification('Database restored!', 'success');
    } catch {
        showNotification('Invalid backup file', 'error');
    }
  };

  const stats = items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoadingDB) {
      return (
          <div className="h-screen bg-slate-50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                  <p className="text-slate-500 font-medium">Loading your second brain...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* 1. Sidebar */}
      <Sidebar 
        activeType={activeType} 
        onSelectType={setActiveType}
        stats={stats}
        onExport={exportData}
        onImport={handleImportWrapper}
        onShowHistory={() => setIsHistoryOpen(true)}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        apiKey={apiKey}
        onSetApiKey={handleSetApiKey}
      />

      {/* 2. Main Area */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600">
                <Menu className="w-6 h-6" />
             </button>
             <span className="font-bold text-slate-900">{activeType === 'All' ? 'Dashboard' : activeType}</span>
          </div>
          {notification && (
            <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
          )}
        </div>

        {/* Desktop Header */}
        <header className="hidden md:flex sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {activeType === 'All' ? 'Dashboard' : activeType}
            </h2>
          </div>
          
          {notification && (
            <div className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium animate-in slide-in-from-top-2
              ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}
            `}>
              {notification.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {notification.message}
            </div>
          )}
        </header>

        {/* Content Container */}
        <div className="flex-1 overflow-hidden relative">
            
            {/* View 1: PARA Board */}
            <div className={`
                h-full w-full overflow-y-auto p-4 md:p-8 
                ${mobileTab === 'board' ? 'block' : 'hidden md:block'}
            `}>
                <div className="w-full pb-24 md:pb-0">
                    <ParaBoard 
                        items={items} 
                        activeType={activeType} 
                        onDelete={handleDeleteWrapper}
                        onToggleComplete={handleToggleCompleteWrapper}
                        allItemsMap={items.reduce((acc, i) => ({...acc, [i.id]: i}), {})}
                    />
                </div>
            </div>

            {/* View 2: Mobile Chat */}
            <div className={`
                h-full w-full absolute inset-0 bg-white z-30
                ${mobileTab === 'chat' ? 'block' : 'hidden'} md:hidden
            `}>
               <ChatPanel 
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onCompleteTask={handleChatCompletion}
                    isProcessing={isProcessing}
                    className="w-full h-[calc(100%-4rem)]" 
               />
            </div>
        </div>
      </div>

      {/* 3. Right Sidebar (Desktop Chat) */}
      <div className="hidden md:block">
        <ChatPanel 
            messages={messages}
            onSendMessage={handleSendMessage}
            onCompleteTask={handleChatCompletion}
            isProcessing={isProcessing}
            className="w-96"
        />
      </div>

      {/* 4. Bottom Navigation (Mobile Only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex justify-around items-center z-50 safe-area-bottom">
        <button 
            onClick={() => setMobileTab('board')}
            className={`flex flex-col items-center gap-1 p-2 ${mobileTab === 'board' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] font-medium">Board</span>
        </button>
        <button 
            onClick={() => setMobileTab('chat')}
            className={`flex flex-col items-center gap-1 p-2 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
            <div className="relative">
                <MessageSquare className="w-6 h-6" />
                {isProcessing && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span></span>}
            </div>
            <span className="text-[10px] font-medium">Chat</span>
        </button>
      </div>

      <HistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        logs={historyLogs}
      />

    </div>
  );
}
