
import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ParaBoard } from './components/ParaBoard';
import { FinanceBoard } from './components/FinanceBoard'; 
import { DynamicModuleBoard } from './components/DynamicModuleBoard'; 
import { ReviewBoard } from './components/ReviewBoard';
import { AgentBoard } from './components/AgentBoard';
import { ModuleBuilderModal } from './components/ModuleBuilderModal'; 
import { HistoryModal } from './components/HistoryModal'; 
import { ManualEntryModal } from './components/ManualEntryModal';
import { LineConnectModal } from './components/LineConnectModal';
import { LifeAnalysisModal } from './components/LifeAnalysisModal'; 
import { CalendarBoard } from './components/CalendarBoard'; 
import { HabitBoard } from './components/HabitBoard'; 
import { ItemDetailModal } from './components/ItemDetailModal'; // New Import
import { ParaType, AppModule, ModuleItem, ViewMode, ParaItem } from './types';
import { CheckCircle2, AlertCircle, Loader2, Menu, LayoutDashboard, MessageSquare, Plus, LayoutGrid, List, Table as TableIcon, Trash2, CheckSquare, PanelRightClose, PanelRightOpen, Sparkles, Search, Calendar as CalendarIcon, Flame, Archive, Network } from 'lucide-react';
import { useParaData } from './hooks/useParaData';
import { useFinanceData } from './hooks/useFinanceData'; 
import { useModuleData } from './hooks/useModuleData'; 
import { useAIChat } from './hooks/useAIChat';
import { useAgentData } from './hooks/useAgentData';
import { classifyQuickCapture } from './services/geminiService';
import { generateId } from './utils/helpers';

type MobileTab = 'board' | 'chat';

export default function App() {
  // --- CORE HOOKS ---
  const { 
    items, historyLogs, isLoadingDB, deleteItem, toggleComplete, exportData, importData, addItem, archiveItem, updateItem
  } = useParaData(); 

  const {
      accounts, transactions, loadFinanceData, addTransaction, addAccount
  } = useFinanceData();

  const {
      modules, moduleItems, loadModules, loadModuleItems, createModule, addModuleItem, deleteModuleItem
  } = useModuleData();
  const {
      isLoading: isLoadingAgentData,
      isRunning: isRunningAgent,
      lastError: agentError,
      runs: agentRuns,
      latestSummary,
      refresh: refreshAgentData,
      triggerDailyRun
  } = useAgentData();

  // --- UI STATE ---
  const [activeType, setActiveType] = useState<ParaType | 'All' | 'Finance' | 'Review' | 'Agent' | string>('All');
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState(''); 
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date()); 

  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ParaItem | null>(null); 
  const [isModuleBuilderOpen, setIsModuleBuilderOpen] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  
  // NEW: Detail Modal State
  const [detailItem, setDetailItem] = useState<ParaItem | null>(null);
  
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- INITIAL LOAD ---
  useEffect(() => {
    loadFinanceData();
    loadModules();
  }, []);

  // --- VIEW LOGIC ---
  useEffect(() => {
      // Load modules when selected
      if (typeof activeType === 'string' && !['All', 'Finance', 'Review', 'Agent', ...Object.values(ParaType)].includes(activeType as any)) {
          loadModuleItems(activeType);
      }
      // Clear selection when changing tabs
      setSelectedIds(new Set());
  }, [activeType]);

  // --- SEARCH & FILTER LOGIC ---
  const filteredParaItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  // Create Map for quick lookup (passed to ParaBoard)
  const allItemsMap = useMemo(() => {
      return items.reduce((acc, item) => ({...acc, [item.id]: item}), {} as Record<string, ParaItem>);
  }, [items]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(tx => 
      tx.description.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  const triageItems = useMemo(() => {
    return items.filter(i => (i.tags || []).includes('triage-pending'));
  }, [items]);

  const opsKpis = useMemo(() => {
    const nowIso = new Date().toISOString();
    const since30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const since7 = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const overdueTasks = items.filter(i => i.type === ParaType.TASK && !i.isCompleted && !!i.dueDate && i.dueDate < nowIso).length;
    const triagePending = triageItems.length;
    const net30d = transactions
      .filter(t => new Date(t.transactionDate).getTime() >= since30)
      .reduce((acc, t) => acc + (t.type === 'INCOME' ? t.amount : (t.type === 'EXPENSE' ? -t.amount : 0)), 0);
    const recentRuns = agentRuns.filter(r => new Date(r.startedAt).getTime() >= since7);
    const automationSuccessRate7d = recentRuns.length
      ? (recentRuns.filter(r => r.status === 'SUCCESS').length / recentRuns.length) * 100
      : 0;

    return { overdueTasks, triagePending, net30d, automationSuccessRate7d };
  }, [items, triageItems, transactions, agentRuns]);

  // For active module
  const activeModule = modules.find(m => m.id === activeType);
  const filteredModuleItems = useMemo(() => {
      if (!activeModule) return [];
      const currentItems = moduleItems[activeModule.id] || [];
      if (!searchQuery.trim()) return currentItems;
      
      const q = searchQuery.toLowerCase();
      return currentItems.filter(item => 
          item.title.toLowerCase().includes(q) ||
          // Search deeper into dynamic data values
          Object.values(item.data).some(val => String(val).toLowerCase().includes(q))
      );
  }, [moduleItems, activeModule, searchQuery]);


  // --- AI INTEGRATION ---
  const { messages, isProcessing, handleSendMessage, handleChatCompletion, analyzeLife } = useAIChat({
    items, 
    accounts,
    modules,
    onAddItem: addItem, 
    onToggleComplete: toggleComplete, 
    onAddTransaction: addTransaction,
    onAddModuleItem: addModuleItem
  });
  
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // --- ACTIONS ---
  const handleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleSelectAll = (ids: string[]) => {
      if (selectedIds.size === ids.length && ids.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(ids));
      }
  };

  const handleBatchDelete = async () => {
      if (!window.confirm(`Delete ${selectedIds.size} items?`)) return;
      
      const ids = Array.from(selectedIds) as string[];
      for (const id of ids) {
          try {
             if (typeof activeType === 'string' && !['All', 'Finance', 'Review', 'Agent', ...Object.values(ParaType)].includes(activeType as any)) {
                 await deleteModuleItem(id, activeType as string);
             } else {
                 await deleteItem(id);
             }
          } catch(e) { console.error(e); }
      }
      setSelectedIds(new Set());
      showNotification('Batch delete complete', 'success');
  };

  const handleBatchComplete = async () => {
      const ids = Array.from(selectedIds) as string[];
      for (const id of ids) {
          try {
             await toggleComplete(id, false); // Force complete
          } catch(e) { console.error(e); }
      }
      setSelectedIds(new Set());
      showNotification('Batch complete success', 'success');
  };

  const handleBatchArchive = async () => {
      const ids = Array.from(selectedIds) as string[];
      let count = 0;
      for (const id of ids) {
          try {
            await archiveItem(id);
            count++;
          } catch(e) { console.error(e); }
      }
      setSelectedIds(new Set());
      showNotification(`Archived ${count} items`, 'success');
  };

  const handleAnalyzeLife = async () => {
      setIsAnalysisModalOpen(true);
      setAnalysisResult(''); // Loading state
      try {
          const result = await analyzeLife(historyLogs, transactions);
          setAnalysisResult(result);
      } catch (e: any) {
          setAnalysisResult(`Error: ${e.message}`);
      }
  };

  const handleQuickCapture = async () => {
      const input = quickCaptureText.trim();
      if (!input || isCapturing) return;
      setIsCapturing(true);
      try {
          const result = await classifyQuickCapture(input, items);
          const baseTags = Array.from(new Set([...(result.suggestedTags || []), 'capture']));
          const now = new Date().toISOString();

          if (result.confidence >= 0.75) {
              const newItem: ParaItem = {
                  id: generateId(),
                  title: result.title,
                  content: result.summary,
                  type: result.type,
                  category: result.category || 'Inbox',
                  tags: baseTags,
                  relatedItemIds: [],
                  isAiGenerated: true,
                  isCompleted: false,
                  createdAt: now,
                  updatedAt: now
              };
              await addItem(newItem);
              showNotification(`Captured as ${result.type}`, 'success');
          } else {
              const triageItem: ParaItem = {
                  id: generateId(),
                  title: result.title || input.slice(0, 60),
                  content: `[Quick Capture]\nOriginal: ${input}\nSuggested: ${result.type} / ${result.category}\nConfidence: ${Math.round(result.confidence * 100)}%`,
                  type: ParaType.TASK,
                  category: result.category || 'Inbox',
                  tags: [...baseTags, 'triage-pending'],
                  relatedItemIds: [],
                  isAiGenerated: true,
                  isCompleted: false,
                  createdAt: now,
                  updatedAt: now
              };
              await addItem(triageItem);
              setActiveType('Agent');
              showNotification(`Needs triage (${Math.round(result.confidence * 100)}%)`, 'error');
          }
          setQuickCaptureText('');
      } catch (e: any) {
          showNotification(`Capture failed: ${e.message || 'unknown error'}`, 'error');
      } finally {
          setIsCapturing(false);
      }
  };

  const handleResolveTriage = async (itemId: string, type: ParaType) => {
      const item = items.find(i => i.id === itemId);
      if (!item) return;
      const next: ParaItem = {
          ...item,
          type,
          tags: (item.tags || []).filter(t => t !== 'triage-pending'),
          updatedAt: new Date().toISOString()
      };
      await updateItem(next);
      showNotification(`Triage resolved as ${type}`, 'success');
  };

  // Wrapper Functions
  const handleDeleteWrapper = async (id: string) => {
    if (!window.confirm('Delete this item?')) return;
    try {
        if (typeof activeType === 'string' && !['All', 'Finance', 'Review', 'Agent', ...Object.values(ParaType)].includes(activeType as any)) {
            await deleteModuleItem(id, activeType as string);
        } else {
            await deleteItem(id);
        }
    } catch { showNotification('Failed to delete', 'error'); }
  };

  const handleArchiveWrapper = async (id: string) => {
     try {
         await archiveItem(id);
         showNotification('Item moved to Archive', 'success');
     } catch {
         showNotification('Failed to archive', 'error');
     }
  };

  // --- MODAL HANDLERS ---
  
  // 1. Edit Item
  const handleEditItem = (id: string) => {
      const itemToEdit = items.find(i => i.id === id);
      if (itemToEdit) {
          setEditingItem(itemToEdit);
          setIsManualModalOpen(true);
          setDetailItem(null); // Close detail view if open
      }
  };

  // 2. View Detail
  const handleViewDetail = (id: string) => {
      const item = items.find(i => i.id === id);
      if (item) {
          setDetailItem(item);
      }
  };

  const handleManualSave = async (data: any, mode: 'PARA' | 'TRANSACTION' | 'ACCOUNT' | 'MODULE') => {
      try {
          if (mode === 'PARA') {
              if (editingItem && editingItem.id === data.id) {
                  await updateItem(data);
                  showNotification('Updated successfully', 'success');
              } else {
                  await addItem(data);
                  showNotification('Created successfully', 'success');
              }
          }
          else if (mode === 'TRANSACTION') {
              await addTransaction(data);
              showNotification('Transaction saved', 'success');
          }
          else if (mode === 'ACCOUNT') {
              await addAccount(data);
              showNotification('Account saved', 'success');
          }
          else if (mode === 'MODULE') {
              await addModuleItem(data);
              showNotification('Entry saved', 'success');
          }
          
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

  const handleModalClose = () => {
      setIsManualModalOpen(false);
      setEditingItem(null);
  };

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
        modules={modules} onCreateModule={() => setIsModuleBuilderOpen(true)}
        onOpenLine={() => setIsLineModalOpen(true)}
        onAnalyzeLife={handleAnalyzeLife}
      />

      <div className="flex-1 flex flex-col min-w-0 relative h-full transition-all duration-300">
        
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 py-3 flex justify-between items-center shrink-0 gap-4">
          <div className="flex items-center gap-3 shrink-0">
             <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-slate-600"><Menu className="w-6 h-6" /></button>
             <h2 className="text-xl font-bold tracking-tight text-slate-900 hidden xs:block">{pageTitle}</h2>
          </div>

          <div className="flex-1 max-w-lg mx-auto hidden md:block relative">
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search titles, tags, content..." 
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-100 hover:bg-slate-200/70 focus:bg-white border border-transparent focus:border-indigo-200 focus:ring-4 focus:ring-indigo-500/10 rounded-full text-sm transition-all duration-200 outline-none placeholder:text-slate-400"
                />
             </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 min-w-[320px] max-w-[440px] w-full">
            <input
              type="text"
              value={quickCaptureText}
              onChange={(e) => setQuickCaptureText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCapture(); }}
              placeholder="Quick Capture: idea, task, project..."
              className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200"
            />
            <button
              onClick={handleQuickCapture}
              disabled={isCapturing || !quickCaptureText.trim()}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-white disabled:opacity-50"
            >
              {isCapturing ? 'Saving...' : 'Capture'}
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeType !== 'Finance' && activeType !== 'Review' && activeType !== 'Agent' && !activeModule && activeType !== 'All' && (
                <div className="hidden md:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button onClick={() => setViewMode('GRID')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'GRID' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Grid"><LayoutGrid className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('LIST')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'LIST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="List"><List className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('TABLE')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'TABLE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Table"><TableIcon className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-slate-300 mx-1 self-center"></div>
                    <button onClick={() => setViewMode('CALENDAR')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'CALENDAR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Calendar"><CalendarIcon className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('HABIT')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'HABIT' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Habit Tracker"><Flame className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('HIERARCHY')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'HIERARCHY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Tree View"><Network className="w-4 h-4" /></button>
                </div>
            )}

            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

            <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 shadow-sm transition-colors">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">New Item</span>
            </button>

            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`hidden md:flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${isChatOpen ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                title="Toggle Chat"
            >
                {isChatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Search Bar */}
        <div className="md:hidden px-4 py-2 bg-white border-b border-slate-100 sticky top-[60px] z-10">
            <div className="space-y-2">
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-slate-100 border-none rounded-lg py-2 pl-4 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickCaptureText}
                  onChange={(e) => setQuickCaptureText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCapture(); }}
                  placeholder="Quick Capture..."
                  className="flex-1 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3 text-sm outline-none"
                />
                <button
                  onClick={handleQuickCapture}
                  disabled={isCapturing || !quickCaptureText.trim()}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-white disabled:opacity-50"
                >
                  {isCapturing ? '...' : 'Go'}
                </button>
              </div>
            </div>
        </div>

        {/* Notification Toast */}
        {notification && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 fade-in duration-300 border backdrop-blur-md bg-white/90 border-slate-200">
                {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                <span className={`text-sm font-semibold ${notification.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{notification.message}</span>
            </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex">
            
            {/* Main Board */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 transition-all duration-300 ${mobileTab === 'board' ? 'block' : 'hidden md:block'}`}>
                <div className="w-full pb-24 md:pb-0 max-w-[1600px] mx-auto">
                    {activeModule ? (
                        <DynamicModuleBoard 
                            module={activeModule}
                            items={filteredModuleItems}
                            onDelete={handleDeleteWrapper}
                        />
                    ) : activeType === 'Finance' ? (
                        <FinanceBoard accounts={accounts} transactions={filteredTransactions} projects={items.filter(i => i.type === ParaType.PROJECT)} />
                    ) : activeType === 'Review' ? (
                        <ReviewBoard items={items} onOpenItem={handleViewDetail} />
                    ) : activeType === 'Agent' ? (
                        <AgentBoard
                            isLoading={isLoadingAgentData}
                            isRunning={isRunningAgent}
                            lastError={agentError}
                            latestSummary={latestSummary}
                            runs={agentRuns}
                            triageItems={triageItems}
                            opsKpis={opsKpis}
                            onRefresh={refreshAgentData}
                            onRunDaily={async (opts) => {
                                try {
                                    await triggerDailyRun({ force: !!opts?.force });
                                    showNotification('Daily agent run completed', 'success');
                                } catch {
                                    showNotification('Daily agent run failed', 'error');
                                }
                            }}
                            onResolveTriage={handleResolveTriage}
                            onOpenTriageItem={handleViewDetail}
                        />
                    ) : viewMode === 'CALENDAR' ? (
                        <CalendarBoard 
                            items={items} 
                            currentDate={calendarDate}
                            onDateChange={setCalendarDate}
                            onSelectItem={handleViewDetail}
                        />
                    ) : viewMode === 'HABIT' ? (
                        <HabitBoard items={items} />
                    ) : (
                        <ParaBoard 
                            items={filteredParaItems} 
                            allItems={items} // Pass FULL list for finding children/relations
                            allItemsMap={allItemsMap} // Pass MAP for quick lookup
                            activeType={activeType as any} 
                            viewMode={viewMode}
                            selectedIds={selectedIds}
                            onSelect={handleSelect}
                            onSelectAll={handleSelectAll}
                            onDelete={handleDeleteWrapper} 
                            onArchive={handleArchiveWrapper}
                            onToggleComplete={(id, s) => toggleComplete(id, s)}
                            onEdit={handleEditItem} 
                            onItemClick={handleViewDetail} // Connect Detail View
                        />
                    )}
                </div>
            </div>

            {/* Chat Panel */}
            <div className={`
                hidden md:block border-l border-slate-200 bg-white transition-all duration-300 ease-in-out relative z-10
                ${isChatOpen ? 'w-96 translate-x-0' : 'w-0 translate-x-full overflow-hidden border-none'}
            `}>
                <div className="w-96 h-full absolute right-0 top-0">
                    <ChatPanel 
                        messages={messages} 
                        onSendMessage={handleSendMessage} 
                        onCompleteTask={handleChatCompletion} 
                        isProcessing={isProcessing} 
                        onClose={() => setIsChatOpen(false)}
                        className="h-full w-full" 
                    />
                </div>
            </div>

            {/* Mobile Chat */}
            <div className={`md:hidden absolute inset-0 bg-white z-20 pb-14 ${mobileTab === 'chat' ? 'block' : 'hidden'}`}>
               <ChatPanel messages={messages} onSendMessage={handleSendMessage} onCompleteTask={handleChatCompletion} isProcessing={isProcessing} className="w-full h-full" />
            </div>

            {/* Batch Action Bar */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-6 duration-300">
                    <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
                        <div className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{selectedIds.size}</div>
                        <span className="text-sm font-medium">Selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeType === 'Tasks' || activeType === 'All' ? (
                             <button onClick={handleBatchComplete} className="p-2 hover:bg-slate-800 rounded-lg text-emerald-400 transition-colors" title="Complete Selected"><CheckSquare className="w-5 h-5" /></button>
                        ) : null}
                        {activeType !== 'Archives' && (
                            <button onClick={handleBatchArchive} className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors" title="Archive Selected"><Archive className="w-5 h-5" /></button>
                        )}
                        <button onClick={handleBatchDelete} className="p-2 hover:bg-slate-800 rounded-lg text-red-400 transition-colors" title="Delete Selected"><Trash2 className="w-5 h-5" /></button>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t flex justify-around items-center z-50 safe-area-bottom">
        <button onClick={() => setMobileTab('board')} className={`flex flex-col items-center gap-0.5 p-1 ${mobileTab === 'board' ? 'text-indigo-600' : 'text-slate-400'}`}><LayoutDashboard className="w-5 h-5" /><span className="text-[9px] font-semibold">Board</span></button>
        <button onClick={() => setMobileTab('chat')} className={`flex flex-col items-center gap-0.5 p-1 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}><MessageSquare className="w-5 h-5" /><span className="text-[9px] font-semibold">Chat</span></button>
      </div>

      {/* Modals */}
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} logs={historyLogs} />
      <LifeAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} content={analysisResult} />
      <ManualEntryModal
        isOpen={isManualModalOpen}
        onClose={handleModalClose}
        onSave={handleManualSave}
        defaultType={activeType}
        projects={items.filter(i => i.type === ParaType.PROJECT)}
        accounts={accounts}
        activeModule={activeModule || null}
        editingItem={editingItem}
        allParaItems={items}
      />
      
      {/* NEW: Item Detail Modal */}
      <ItemDetailModal 
        isOpen={!!detailItem}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        allItems={items}
        onNavigate={handleViewDetail}
        onEdit={handleEditItem}
      />

      <ModuleBuilderModal isOpen={isModuleBuilderOpen} onClose={() => setIsModuleBuilderOpen(false)} onSave={handleCreateModule} />
      <LineConnectModal isOpen={isLineModalOpen} onClose={() => setIsLineModalOpen(false)} />
    </div>
  );
}
