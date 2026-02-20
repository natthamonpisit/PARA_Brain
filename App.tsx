import React, { Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { ParaBoard } from './components/ParaBoard';
import { DynamicModuleBoard } from './components/DynamicModuleBoard';
import { ModuleBuilderModal } from './components/ModuleBuilderModal';
import { HistoryModal } from './components/HistoryModal';
import { ManualEntryModal } from './components/ManualEntryModal';
import { TelegramConnectModal } from './components/TelegramConnectModal';
import { LifeAnalysisModal } from './components/LifeAnalysisModal';
import { CalendarBoard } from './components/CalendarBoard';
import { HabitBoard } from './components/HabitBoard';
import { ItemDetailModal } from './components/ItemDetailModal';
import { FocusDock } from './components/FocusDock';
import { MissionControlBoard } from './components/MissionControlBoard';
import { LifeOverviewBoard } from './components/LifeOverviewBoard';
import { ThailandPulseBoard } from './components/ThailandPulseBoard';
import { ParaType } from './types';
import {
  CheckCircle2, AlertCircle, Loader2, Menu, MessageSquare, Plus,
  LayoutGrid, List, Table as TableIcon, Trash2, CheckSquare,
  Search, Calendar as CalendarIcon, Flame, Archive, Network,
  Minimize2, Maximize2, Undo2
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { useAppState } from './hooks/useAppState';

const ChatPanel      = React.lazy(() => import('./components/ChatPanel').then((m) => ({ default: m.ChatPanel })));
const FinanceBoard   = React.lazy(() => import('./components/FinanceBoard').then((m) => ({ default: m.FinanceBoard })));
const ReviewBoard    = React.lazy(() => import('./components/ReviewBoard').then((m) => ({ default: m.ReviewBoard })));
const AgentBoard     = React.lazy(() => import('./components/AgentBoard').then((m) => ({ default: m.AgentBoard })));
const AIConfigBoard  = React.lazy(() => import('./components/AIConfigBoard').then((m) => ({ default: m.AIConfigBoard })));
const SubscriptionsBoard = React.lazy(() => import('./components/SubscriptionsBoard').then((m) => ({ default: m.SubscriptionsBoard })));

export default function App() {
  const { user, loading: authLoading, isAuthorized, signInWithGoogle, signOut } = useAuth();

  const {
    // data
    items, historyLogs, isLoadingDB, exportData, importData,
    accounts, transactions, addTransaction, addAccount,
    subscriptions, isLoadingSubscriptions, addSubscription, updateSubscription, deleteSubscription,
    modules,
    isLoadingAgentData, isRunningAgent, agentError, agentRuns, captureKpis, latestSummary,
    refreshAgentData, triggerDailyRun,
    // AI chat
    messages, isProcessing, handleSendMessage, handleSendImage, handleChatCompletion,
    // ui state
    activeType, setActiveType,
    viewMode, setViewMode,
    isChatOpen, setIsChatOpen,
    isChatCompact, setIsChatCompact,
    isDesktopViewport,
    selectedIds,
    searchQuery, setSearchQuery,
    calendarDate, setCalendarDate,
    isMobileMenuOpen, setIsMobileMenuOpen,
    // modals
    isHistoryOpen, setIsHistoryOpen,
    isManualModalOpen, setIsManualModalOpen,
    editingItem,
    isModuleBuilderOpen, setIsModuleBuilderOpen,
    isTelegramModalOpen, setIsTelegramModalOpen,
    isAnalysisModalOpen, setIsAnalysisModalOpen,
    analysisResult,
    detailItem, setDetailItem,
    // notification
    notification, showNotification,
    // derived
    filteredParaItems, allItemsMap, filteredTransactions,
    triageItems, opsKpis,
    activeModule, filteredModuleItems,
    pageTitle, shouldShowFocusDock,
    // handlers
    handleToggleComplete,
    handleSelect, handleSelectAll,
    handleBatchDelete, handleBatchComplete, handleBatchArchive,
    handleAnalyzeLife, handleResolveTriage,
    handleDeleteWrapper, handleArchiveWrapper,
    handleSavePulseArticle,
    handleEditItem, handleViewDetail,
    handleManualSave, handleCreateModule, handleModalClose,
  } = useAppState();

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (!isAuthorized) {
    return (
      <LoginPage
        onSignIn={signInWithGoogle}
        error={user ? 'Access restricted. Sign in with the authorized account.' : null}
      />
    );
  }
  if (isLoadingDB) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  const boardFallback = (
    <div className="h-48 flex items-center justify-center text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-100 overflow-hidden">

      <Sidebar
        activeType={activeType} onSelectType={setActiveType}
        stats={items.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] || 0) + 1 }), {} as any)}
        onExport={exportData}
        onImport={(f) => importData(f).then(() => showNotification('Restored!', 'success'))}
        onShowHistory={() => setIsHistoryOpen(true)}
        isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}
        modules={modules} onCreateModule={() => setIsModuleBuilderOpen(true)}
        onOpenTelegram={() => setIsTelegramModalOpen(true)}
        onAnalyzeLife={handleAnalyzeLife}
        onSignOut={signOut}
        userEmail={user?.email}
        userAvatar={user?.user_metadata?.avatar_url}
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
                type="text" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search command, task, context..."
                className="w-full pl-9 pr-4 py-1.5 bg-slate-900 hover:bg-slate-800 focus:bg-slate-900 border border-slate-700 focus:border-cyan-400/50 focus:ring-4 focus:ring-cyan-500/10 rounded-full text-sm text-slate-200 transition-all duration-200 outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeType !== 'Finance' && activeType !== 'Review' && activeType !== 'Agent' && activeType !== 'LifeOverview' && activeType !== 'ThailandPulse' && activeType !== 'AIConfig' && !activeModule && activeType !== 'All' && (
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
              <Plus className="w-3.5 h-3.5" /><span className="hidden md:inline">New Item</span>
            </button>
            <button
              onClick={() => setIsChatOpen((prev) => !prev)}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${isChatOpen ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-xs font-semibold">{isChatOpen ? 'Close' : 'Chat'}</span>
            </button>
          </div>
        </header>

        {/* Mobile Search */}
        <div className="md:hidden px-4 py-2 bg-slate-950 border-b border-slate-800 sticky top-[60px] z-10">
          <input
            type="text" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-4 pr-4 text-sm text-slate-200 focus:ring-2 focus:ring-cyan-500/20 outline-none"
          />
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 fade-in duration-300 border backdrop-blur-md bg-slate-900/95 border-slate-700">
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-300" /> : <AlertCircle className="w-5 h-5 text-rose-300" />}
            <span className={`text-sm font-semibold ${notification.type === 'success' ? 'text-emerald-200' : 'text-rose-200'}`}>{notification.message}</span>
            {notification.action && (
              <button onClick={notification.action.onClick} className="ml-2 inline-flex items-center gap-1 rounded-md border border-emerald-200/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20">
                <Undo2 className="w-3 h-3" /><span>{notification.action.label}</span>
              </button>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 lg:p-8 transition-all duration-300">
            <div className="w-full pb-24 md:pb-0 max-w-[1600px] mx-auto">
              {shouldShowFocusDock && (
                <FocusDock items={items} onOpenItem={handleViewDetail} onGoTasks={() => setActiveType(ParaType.TASK)} />
              )}

              {activeModule ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <DynamicModuleBoard module={activeModule} items={filteredModuleItems} onDelete={handleDeleteWrapper} />
                </div>
              ) : activeType === 'All' ? (
                <MissionControlBoard items={items} runs={agentRuns} triageItems={triageItems} onOpenItem={handleViewDetail} onGoAgent={() => setActiveType('Agent')} />
              ) : activeType === 'Finance' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <Suspense fallback={boardFallback}>
                    <FinanceBoard accounts={accounts} transactions={filteredTransactions} projects={items.filter(i => i.type === ParaType.PROJECT)} onAddTransaction={addTransaction} onAddAccount={addAccount} />
                  </Suspense>
                </div>
              ) : activeType === 'Review' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <Suspense fallback={boardFallback}><ReviewBoard items={items} onOpenItem={handleViewDetail} /></Suspense>
                </div>
              ) : activeType === 'Agent' ? (
                <Suspense fallback={boardFallback}>
                  <AgentBoard
                    isLoading={isLoadingAgentData} isRunning={isRunningAgent} lastError={agentError}
                    latestSummary={latestSummary} runs={agentRuns} triageItems={triageItems}
                    opsKpis={opsKpis} captureKpis={captureKpis}
                    onRefresh={refreshAgentData}
                    onRunDaily={async (opts) => {
                      try { await triggerDailyRun({ force: !!opts?.force }); showNotification('Daily agent run completed', 'success'); }
                      catch { showNotification('Daily agent run failed', 'error'); }
                    }}
                    onResolveTriage={handleResolveTriage} onOpenTriageItem={handleViewDetail}
                  />
                </Suspense>
              ) : activeType === 'LifeOverview' ? (
                <LifeOverviewBoard items={items} onOpenItem={handleViewDetail} />
              ) : activeType === 'ThailandPulse' ? (
                <ThailandPulseBoard onSaveArticle={handleSavePulseArticle} />
              ) : activeType === 'AIConfig' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <Suspense fallback={boardFallback}><AIConfigBoard /></Suspense>
                </div>
              ) : activeType === 'Subscriptions' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <Suspense fallback={boardFallback}>
                    <SubscriptionsBoard subscriptions={subscriptions} onAdd={addSubscription} onUpdate={updateSubscription} onDelete={deleteSubscription} isLoading={isLoadingSubscriptions} />
                  </Suspense>
                </div>
              ) : viewMode === 'CALENDAR' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <CalendarBoard items={items} currentDate={calendarDate} onDateChange={setCalendarDate} onSelectItem={handleViewDetail} />
                </div>
              ) : viewMode === 'HABIT' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <HabitBoard items={items} />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
                  <ParaBoard
                    items={filteredParaItems} allItems={items} allItemsMap={allItemsMap}
                    activeType={activeType as any} viewMode={viewMode}
                    selectedIds={selectedIds}
                    onSelect={handleSelect} onSelectAll={handleSelectAll}
                    onDelete={handleDeleteWrapper} onArchive={handleArchiveWrapper}
                    onToggleComplete={handleToggleComplete} onEdit={handleEditItem}
                    onItemClick={handleViewDetail}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Batch Action Bar */}
          {selectedIds.size > 0 && (
            <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-4 md:px-6 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-4 w-[calc(100%-1.5rem)] max-w-xl animate-in slide-in-from-bottom-6 duration-300">
              <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
                <div className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">{selectedIds.size}</div>
                <span className="text-sm font-medium">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                {(activeType === 'Tasks' || activeType === 'All') && (
                  <button onClick={handleBatchComplete} className="p-2 hover:bg-slate-800 rounded-lg text-emerald-400 transition-colors" title="Complete Selected"><CheckSquare className="w-5 h-5" /></button>
                )}
                {activeType !== 'Archives' && (
                  <button onClick={handleBatchArchive} className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors" title="Archive Selected"><Archive className="w-5 h-5" /></button>
                )}
                <button onClick={handleBatchDelete} className="p-2 hover:bg-slate-800 rounded-lg text-red-400 transition-colors" title="Delete Selected"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat overlay */}
      {isChatOpen && (
        <button onClick={() => setIsChatOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 md:bg-slate-950/45 backdrop-blur-[1px]" aria-label="Close chat overlay" />
      )}

      <div className={`fixed z-50 transition-all duration-200 ease-out left-0 right-0 top-0 bottom-0 md:left-auto md:top-auto md:right-6 md:bottom-6 ${isDesktopViewport ? (isChatCompact ? 'md:w-[320px] md:h-[420px]' : 'md:w-[390px] md:h-[min(72vh,640px)]') : ''} ${isChatOpen ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-6 md:translate-y-4 opacity-0 pointer-events-none'}`}>
        {isChatOpen && isDesktopViewport && (
          <div className="absolute -top-10 right-0 flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/95 px-2 py-1 shadow-xl">
            <button onClick={() => setIsChatCompact((prev) => !prev)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-cyan-200">
              {isChatCompact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              <span>{isChatCompact ? 'Expand' : 'Compact'}</span>
            </button>
            <button onClick={() => setIsChatOpen(false)} className="rounded-full px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-rose-200">Close</button>
          </div>
        )}
        <Suspense fallback={boardFallback}>
          <ChatPanel
            messages={messages} onSendMessage={handleSendMessage} onSendImage={handleSendImage}
            onCompleteTask={handleChatCompletion} isProcessing={isProcessing}
            onClose={() => setIsChatOpen(false)}
            className={`h-full w-full shadow-2xl overflow-hidden ${isDesktopViewport ? 'rounded-2xl border border-slate-700' : 'rounded-none border-x-0 border-b-0 border-t border-slate-700'}`}
          />
        </Suspense>
      </div>

      {!isChatOpen && (
        <button onClick={() => setIsChatOpen(true)} className="fixed z-50 right-4 bottom-4 md:right-6 md:bottom-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/50 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-cyan-200 shadow-xl hover:bg-cyan-500/10">
          <MessageSquare className="w-4 h-4" /><span>AI Copilot</span>
        </button>
      )}

      {/* Modals */}
      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} logs={historyLogs} />
      <LifeAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} content={analysisResult} />
      <ManualEntryModal
        isOpen={isManualModalOpen} onClose={handleModalClose} onSave={handleManualSave}
        defaultType={activeType} projects={items.filter(i => i.type === ParaType.PROJECT)}
        accounts={accounts} activeModule={activeModule || null}
        editingItem={editingItem} allParaItems={items}
      />
      <ItemDetailModal
        isOpen={!!detailItem} onClose={() => setDetailItem(null)}
        item={detailItem} allItems={items}
        onNavigate={handleViewDetail} onEdit={handleEditItem} onToggleComplete={handleToggleComplete}
      />
      <ModuleBuilderModal isOpen={isModuleBuilderOpen} onClose={() => setIsModuleBuilderOpen(false)} onSave={handleCreateModule} />
      <TelegramConnectModal isOpen={isTelegramModalOpen} onClose={() => setIsTelegramModalOpen(false)} />
    </div>
  );
}
