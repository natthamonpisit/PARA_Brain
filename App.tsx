
import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ParaBoard } from './components/ParaBoard';
import { DynamicModuleBoard } from './components/DynamicModuleBoard'; 
import { ModuleBuilderModal } from './components/ModuleBuilderModal'; 
import { HistoryModal } from './components/HistoryModal'; 
import { ManualEntryModal } from './components/ManualEntryModal';
import { LineConnectModal } from './components/LineConnectModal';
import { LifeAnalysisModal } from './components/LifeAnalysisModal'; 
import { CalendarBoard } from './components/CalendarBoard'; 
import { HabitBoard } from './components/HabitBoard'; 
import { ItemDetailModal } from './components/ItemDetailModal'; // New Import
import { FocusDock } from './components/FocusDock';
import { MissionControlBoard } from './components/MissionControlBoard';
import { ParaType, AppModule, ViewMode, ParaItem } from './types';
import { CheckCircle2, AlertCircle, Loader2, Menu, MessageSquare, Plus, LayoutGrid, List, Table as TableIcon, Trash2, CheckSquare, Search, Calendar as CalendarIcon, Flame, Archive, Network } from 'lucide-react';
import { useParaData } from './hooks/useParaData';
import { useFinanceData } from './hooks/useFinanceData'; 
import { useModuleData } from './hooks/useModuleData'; 
import { useAIChat } from './hooks/useAIChat';
import { useAgentData } from './hooks/useAgentData';
import { classifyQuickCapture } from './services/geminiService';
import { generateId } from './utils/helpers';

const ChatPanel = React.lazy(() => import('./components/ChatPanel').then((m) => ({ default: m.ChatPanel })));
const FinanceBoard = React.lazy(() => import('./components/FinanceBoard').then((m) => ({ default: m.FinanceBoard })));
const ReviewBoard = React.lazy(() => import('./components/ReviewBoard').then((m) => ({ default: m.ReviewBoard })));
const AgentBoard = React.lazy(() => import('./components/AgentBoard').then((m) => ({ default: m.AgentBoard })));

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
  const [isChatOpen, setIsChatOpen] = useState(false);
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
  const shouldShowFocusDock = activeType !== 'Agent';
  const boardFallback = (
    <div className="h-48 flex items-center justify-center text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );

  if (isLoadingDB) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-100 overflow-hidden">
      
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

      <div className="flex-1 flex flex-col min-w-0 relative h-full transition-all duration-300 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        
        {/* Header */}
        <header className="sticky top-0 z-20 bg-slate-950/85 backdrop-blur-md border-b border-slate-800 px-4 md:px-6 py-3 flex justify-between items-center shrink-0 gap-4">
          <div className="flex items-center gap-3 shrink-0">
             <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-slate-300"><Menu className="w-6 h-6" /></button>
             <h2 className="text-xl font-bold tracking-tight text-slate-100 hidden xs:block">{activeType === 'All' ? 'Mission Control' : pageTitle}</h2>
          </div>

          <div className="flex-1 max-w-lg mx-auto hidden md:block relative">
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-cyan-300 transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search command, task, context..." 
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-900 hover:bg-slate-800 focus:bg-slate-900 border border-slate-700 focus:border-cyan-400/50 focus:ring-4 focus:ring-cyan-500/10 rounded-full text-sm text-slate-200 transition-all duration-200 outline-none placeholder:text-slate-500"
                />
             </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 min-w-[320px] max-w-[440px] w-full">
            <input
              type="text"
              value={quickCaptureText}
              onChange={(e) => setQuickCaptureText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCapture(); }}
              placeholder="Command capture: idea, task, project..."
              className="w-full bg-slate-900 border border-amber-400/40 text-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300/30"
            />
            <button
              onClick={handleQuickCapture}
              disabled={isCapturing || !quickCaptureText.trim()}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 disabled:opacity-50"
            >
              {isCapturing ? 'Saving...' : 'Capture'}
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeType !== 'Finance' && activeType !== 'Review' && activeType !== 'Agent' && !activeModule && activeType !== 'All' && (
                <div className="hidden md:flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                    <button onClick={() => setViewMode('GRID')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'GRID' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="Grid"><LayoutGrid className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('LIST')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'LIST' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="List"><List className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('TABLE')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'TABLE' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="Table"><TableIcon className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-slate-700 mx-1 self-center"></div>
                    <button onClick={() => setViewMode('CALENDAR')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'CALENDAR' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="Calendar"><CalendarIcon className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('HABIT')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'HABIT' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="Habit Tracker"><Flame className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('HIERARCHY')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'HIERARCHY' ? 'bg-cyan-500/15 text-cyan-200 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} title="Tree View"><Network className="w-4 h-4" /></button>
                </div>
            )}

            <div className="h-6 w-px bg-slate-700 hidden md:block"></div>

            <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 text-slate-950 text-xs font-bold rounded-lg hover:bg-cyan-400 shadow-sm transition-colors">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">New Item</span>
            </button>

            <button
              onClick={() => setIsChatOpen((prev) => !prev)}
              className={`hidden md:flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-colors ${isChatOpen ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
              title="Toggle Chat Widget"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile Search Bar */}
        <div className="md:hidden px-4 py-2 bg-slate-950 border-b border-slate-800 sticky top-[60px] z-10">
            <div className="space-y-2">
              <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-4 pr-4 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500/20 outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickCaptureText}
                  onChange={(e) => setQuickCaptureText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCapture(); }}
                  placeholder="Quick Capture..."
                  className="flex-1 bg-slate-900 border border-amber-400/40 rounded-lg py-2 px-3 text-sm text-slate-200 outline-none"
                />
                <button
                  onClick={handleQuickCapture}
                  disabled={isCapturing || !quickCaptureText.trim()}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 disabled:opacity-50"
                >
                  {isCapturing ? '...' : 'Go'}
                </button>
              </div>
            </div>
        </div>

        {/* Notification Toast */}
        {notification && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 fade-in duration-300 border backdrop-blur-md bg-slate-900/95 border-slate-700">
                {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> : <AlertCircle className="w-5 h-5 text-rose-300" />}
                <span className={`text-sm font-semibold ${notification.type === 'success' ? 'text-emerald-200' : 'text-rose-200'}`}>{notification.message}</span>
            </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex">
            
            {/* Main Board */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 transition-all duration-300">
                <div className="w-full pb-24 md:pb-0 max-w-[1600px] mx-auto">
                    {shouldShowFocusDock && (
                        <FocusDock
                          items={items}
                          onOpenItem={handleViewDetail}
                          onGoTasks={() => setActiveType(ParaType.TASK)}
                        />
                    )}
                    {activeModule ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                          <DynamicModuleBoard 
                              module={activeModule}
                              items={filteredModuleItems}
                              onDelete={handleDeleteWrapper}
                          />
                        </div>
                    ) : activeType === 'All' ? (
                        <MissionControlBoard
                          items={items}
                          runs={agentRuns}
                          triageItems={triageItems}
                          onOpenItem={handleViewDetail}
                          onGoAgent={() => setActiveType('Agent')}
                        />
                    ) : activeType === 'Finance' ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                          <Suspense fallback={boardFallback}>
                              <FinanceBoard accounts={accounts} transactions={filteredTransactions} projects={items.filter(i => i.type === ParaType.PROJECT)} />
                          </Suspense>
                        </div>
                    ) : activeType === 'Review' ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                          <Suspense fallback={boardFallback}>
                              <ReviewBoard items={items} onOpenItem={handleViewDetail} />
                          </Suspense>
                        </div>
                    ) : activeType === 'Agent' ? (
                        <Suspense fallback={boardFallback}>
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
                        </Suspense>
                    ) : viewMode === 'CALENDAR' ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                          <CalendarBoard 
                              items={items} 
                              currentDate={calendarDate}
                              onDateChange={setCalendarDate}
                              onSelectItem={handleViewDetail}
                          />
                        </div>
                    ) : viewMode === 'HABIT' ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                          <HabitBoard items={items} />
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
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
                        </div>
                    )}
                </div>
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

      {isChatOpen && (
        <button
          onClick={() => setIsChatOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px]"
          aria-label="Close chat overlay"
        />
      )}

      <div className={`
        fixed z-50 transition-all duration-200 ease-out
        left-3 right-3 bottom-3 h-[72vh]
        md:left-auto md:right-6 md:bottom-6 md:w-[390px] md:h-[min(72vh,640px)]
        ${isChatOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-6 opacity-0 pointer-events-none'}
      `}>
        <Suspense fallback={boardFallback}>
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onCompleteTask={handleChatCompletion}
            isProcessing={isProcessing}
            onClose={() => setIsChatOpen(false)}
            className="h-full w-full rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
          />
        </Suspense>
      </div>

      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed z-50 right-5 bottom-5 md:right-6 md:bottom-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/50 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-cyan-200 shadow-xl hover:bg-cyan-500/10"
          title="Open AI Copilot"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">AI Copilot</span>
        </button>
      )}

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
