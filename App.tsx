import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ParaBoard } from './components/ParaBoard';
import { HistoryModal } from './components/HistoryModal'; 
import { ParaType, ParaItem, AIAnalysisResult, ExistingItemContext, ChatMessage, HistoryAction, HistoryLog } from './types';
import { analyzeParaInput } from './services/geminiService';
import { db } from './services/db';
import { CheckCircle2, AlertCircle, Loader2, Menu, LayoutDashboard, MessageSquare } from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2, 9);

const INITIAL_ITEMS: ParaItem[] = [
  {
    id: '1',
    title: 'Launch Personal Website',
    content: 'Need to finish the landing page and connect the contact form.',
    type: ParaType.PROJECT,
    category: 'Coding',
    tags: ['web', 'react'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Weekly Cardio Routine',
    content: 'Run 5km every Monday, Wednesday, and Friday.',
    type: ParaType.AREA,
    category: 'Health',
    tags: ['running', 'habit'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    title: 'React 18 Concurrent Mode Notes',
    content: 'Key concepts: `useTransition`, `useDeferredValue`. Helps with UI responsiveness.',
    type: ParaType.RESOURCE,
    category: 'Dev Knowledge',
    tags: ['react', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

type MobileTab = 'board' | 'chat';

export default function App() {
  const [items, setItems] = useState<ParaItem[]>([]);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [activeType, setActiveType] = useState<ParaType | 'All'>('All');
  
  // UI States
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'warning'} | null>(null);

  // Mobile Specific States
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // 1. LIFECYCLE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadData();
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      text: 'Welcome back! I am your PARA AI. Tell me what is on your mind, and I will organize it for you.',
      timestamp: new Date()
    }]);
  }, []);

  const loadData = async () => {
      try {
          setIsLoadingDB(true);
          const data = await db.seedIfEmpty(INITIAL_ITEMS);
          const sorted = data.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setItems(sorted);
          const logs = await db.getLogs();
          setHistoryLogs(logs);
      } catch (e) {
          console.error("Failed to load DB:", e);
          setNotification({ message: 'Database Error', type: 'error' });
      } finally {
          setIsLoadingDB(false);
      }
  };

  const logHistory = async (action: HistoryAction, item: ParaItem) => {
      const newLog: HistoryLog = {
          id: generateId(),
          action,
          itemTitle: item.title,
          itemType: item.type,
          timestamp: new Date().toISOString()
      };
      await db.addLog(newLog);
      setHistoryLogs(prev => [newLog, ...prev]);
  };

  // ---------------------------------------------------------------------------
  // 2. LOGIC: AI & Manual Import
  // ---------------------------------------------------------------------------
  
  const handleManualJsonImport = async (jsonInput: string) => {
    try {
        const parsed = JSON.parse(jsonInput);
        if (!parsed.type || !parsed.title) throw new Error("Invalid JSON format");

        const newItem: ParaItem = {
            id: generateId(),
            title: parsed.title,
            content: parsed.summary || parsed.content || '',
            type: parsed.type,
            category: parsed.category || 'Inbox',
            tags: parsed.suggestedTags || [],
            relatedItemIds: parsed.relatedItemIdsCandidates || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isAiGenerated: true 
        };

        await db.add(newItem);
        await logHistory('CREATE', newItem);

        setItems(prev => [newItem, ...prev]);
        setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            text: 'I have manually imported the JSON data.',
            createdItem: newItem,
            timestamp: new Date()
        }]);
    } catch (e) {
        setMessages(prev => [...prev, {
            id: generateId(),
            role: 'assistant',
            text: 'Error importing JSON. Please check the format.',
            timestamp: new Date()
        }]);
    }
  };

  const handleSendMessage = async (input: string) => {
    const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        text: input,
        timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    if (input.trim().startsWith('{')) {
        await handleManualJsonImport(input);
        return;
    }

    setIsProcessing(true);

    try {
      const context: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type
      }));
      
      const result: AIAnalysisResult = await analyzeParaInput(input, context);

      const newItem: ParaItem = {
        id: generateId(),
        title: result.title,
        content: result.summary, 
        type: result.type,
        category: result.category,
        tags: result.suggestedTags,
        relatedItemIds: result.relatedItemIdsCandidates, 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAiGenerated: true
      };

      await db.add(newItem);
      await logHistory('CREATE', newItem);

      setItems(prev => [newItem, ...prev]);
      setMessages(prev => [...prev, {
          id: generateId(),
          role: 'assistant',
          text: result.reasoning || `I've organized this into your ${result.type}.`,
          createdItem: newItem,
          timestamp: new Date()
      }]);
      
    } catch (error) {
      console.error(error);
      let errorMsg = "I'm having trouble connecting to my brain right now.";
      if (error instanceof Error && error.message === "MISSING_API_KEY") {
          errorMsg = "I can't access the API Key. Please verify your deployment settings.";
      }
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'assistant',
        text: errorMsg,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
          const itemToDelete = items.find(i => i.id === id);
          if (itemToDelete) await logHistory('DELETE', itemToDelete);
          await db.delete(id);
          setItems(prev => prev.filter(i => i.id !== id));
      } catch (e) {
          setNotification({ message: 'Failed to delete', type: 'error' });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 3. DATA SYNC
  // ---------------------------------------------------------------------------
  const handleExportDB = async () => {
    try {
        const allItems = await db.getAll();
        const allHistory = await db.getLogs();
        const exportData = { items: allItems, history: allHistory };
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `para-brain-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setNotification({ message: 'Backup downloaded!', type: 'success' });
    } catch (e) {
        setNotification({ message: 'Export failed', type: 'error' });
    }
  };

  const handleImportDB = async (file: File) => {
      if (!window.confirm('This will REPLACE all current data. Continue?')) {
          return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const content = e.target?.result as string;
              const parsed = JSON.parse(content);
              const newItems = Array.isArray(parsed) ? parsed : parsed.items;
              
              setIsLoadingDB(true);
              await db.clear();
              await db.bulkAdd(newItems);
              await loadData();
              setNotification({ message: 'Database restored!', type: 'success' });
              
              setMessages(prev => [...prev, {
                  id: generateId(),
                  role: 'assistant',
                  text: 'I have restored your database from backup.',
                  timestamp: new Date()
              }]);
          } catch (err) {
              setNotification({ message: 'Invalid backup file', type: 'error' });
              setIsLoadingDB(false);
          }
      };
      reader.readAsText(file);
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

  // JAY'S NOTE: Responsive Layout Architecture
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* 1. Sidebar (Responsive Drawer) */}
      <Sidebar 
        activeType={activeType} 
        onSelectType={setActiveType}
        stats={stats}
        onExport={handleExportDB}
        onImport={handleImportDB}
        onShowHistory={() => setIsHistoryOpen(true)}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Area 
          JAY'S NOTE: Removed md:ml-64 because sidebar is now static in flex flow.
          This fixes the double spacing issue.
      */}
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

        {/* Content Container (Scrollable) */}
        <div className="flex-1 overflow-hidden relative">
            
            {/* View 1: PARA Board */}
            <div className={`
                h-full w-full overflow-y-auto p-4 md:p-8 
                ${mobileTab === 'board' ? 'block' : 'hidden md:block'}
            `}>
                {/* JAY'S NOTE: Removed max-w entirely to ensure it aligns left and fills space naturally */}
                <div className="w-full pb-24 md:pb-0">
                    <ParaBoard 
                        items={items} 
                        activeType={activeType} 
                        onDelete={handleDelete}
                        allItemsMap={items.reduce((acc, i) => ({...acc, [i.id]: i}), {})}
                    />
                </div>
            </div>

            {/* View 2: Mobile Chat (Hidden on Desktop here, moved to side) */}
            <div className={`
                h-full w-full absolute inset-0 bg-white z-30
                ${mobileTab === 'chat' ? 'block' : 'hidden'} md:hidden
            `}>
               <ChatPanel 
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    isProcessing={isProcessing}
                    className="w-full h-[calc(100%-4rem)]" // Subtract bottom nav height
               />
            </div>
        </div>
      </div>

      {/* 3. Right Sidebar (Desktop Chat) */}
      <div className="hidden md:block">
        <ChatPanel 
            messages={messages}
            onSendMessage={handleSendMessage}
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
