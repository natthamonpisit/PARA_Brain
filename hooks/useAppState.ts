// ─── App State Hook ────────────────────────────────────────────────────────────
// Centralises all UI state, effects, derived data, and handlers from App.tsx.
// App.tsx becomes a thin wiring layer that just renders JSX.

import { useState, useEffect, useMemo, useRef } from 'react';
import { ParaType, AppModule, ViewMode, ParaItem } from '../types';
import { useParaData } from './useParaData';
import { useFinanceData } from './useFinanceData';
import { useSubscriptionsData } from './useSubscriptionsData';
import { useModuleData } from './useModuleData';
import { useAIChat } from './useAIChat';
import { useAgentData } from './useAgentData';
import type { PulseArticle } from '../services/thailandPulseService';
import { generateId } from '../utils/helpers';

export type ActiveView =
  | ParaType
  | 'All'
  | 'LifeOverview'
  | 'ThailandPulse'
  | 'Finance'
  | 'Review'
  | 'Agent'
  | 'AIConfig'
  | 'Subscriptions'
  | string;

export const BUILTIN_VIEW_TYPES = new Set<string>([
  'All', 'LifeOverview', 'ThailandPulse', 'Finance',
  'Review', 'Agent', 'AIConfig', 'Subscriptions',
  ...Object.values(ParaType)
]);

export const isModuleViewType = (value: ActiveView): value is string =>
  typeof value === 'string' && !BUILTIN_VIEW_TYPES.has(value);

// ─── Notification type ────────────────────────────────────────────────────────

export interface AppNotification {
  message: string;
  type: 'success' | 'error';
  action?: { label: string; onClick: () => void };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppState() {
  // ─── Data hooks ──────────────────────────────────────────────────────────

  const {
    items, historyLogs, isLoadingDB, deleteItem, toggleComplete,
    exportData, importData, addItem, archiveItem, updateItem
  } = useParaData();

  const { accounts, transactions, loadFinanceData, addTransaction, addAccount } = useFinanceData();

  const {
    subscriptions, isLoadingSubscriptions, loadSubscriptions,
    addSubscription, updateSubscription, deleteSubscription
  } = useSubscriptionsData();

  const {
    modules, moduleItems, loadModules, loadModuleItems, createModule, addModuleItem, deleteModuleItem
  } = useModuleData();

  const {
    isLoading: isLoadingAgentData,
    isRunning: isRunningAgent,
    lastError: agentError,
    runs: agentRuns,
    captureKpis,
    latestSummary,
    refresh: refreshAgentData,
    triggerDailyRun
  } = useAgentData();

  // ─── UI state ─────────────────────────────────────────────────────────────

  const [activeType, setActiveType] = useState<ActiveView>('All');
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatCompact, setIsChatCompact] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('para-chat-compact') === '1';
  });
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ParaItem | null>(null);
  const [isModuleBuilderOpen, setIsModuleBuilderOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [detailItem, setDetailItem] = useState<ParaItem | null>(null);

  // Notification
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const notificationTimerRef = useRef<number | null>(null);

  // ─── Initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadFinanceData();
    loadModules();
    loadSubscriptions();
  }, []);

  // ─── Viewport listener ────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 768px)');
    const syncViewport = () => setIsDesktopViewport(media.matches);
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!isDesktopViewport && isChatCompact) setIsChatCompact(false);
  }, [isDesktopViewport, isChatCompact]);

  // ─── Chat effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isChatOpen || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsChatOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isChatOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('para-chat-compact', isChatCompact ? '1' : '0');
  }, [isChatCompact]);

  useEffect(() => {
    if (typeof document === 'undefined' || !isChatOpen || isDesktopViewport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isChatOpen, isDesktopViewport]);

  // ─── Active view effect ───────────────────────────────────────────────────

  useEffect(() => {
    if (isModuleViewType(activeType)) loadModuleItems(activeType);
    setSelectedIds(new Set());
  }, [activeType]);

  // ─── Keep detailItem in sync ──────────────────────────────────────────────

  useEffect(() => {
    if (!detailItem) return;
    const latest = items.find(i => i.id === detailItem.id);
    if (!latest) { setDetailItem(null); return; }
    if (latest !== detailItem) setDetailItem(latest);
  }, [items, detailItem]);

  // ─── Notification helpers ─────────────────────────────────────────────────

  const clearNotificationTimer = () => {
    if (notificationTimerRef.current !== null) {
      window.clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }
  };

  const showNotification = (
    message: string,
    type: 'success' | 'error',
    options?: { durationMs?: number; action?: { label: string; onClick: () => void } }
  ) => {
    clearNotificationTimer();
    setNotification({ message, type, action: options?.action });
    const durationMs = options?.durationMs ?? 3000;
    if (durationMs > 0) {
      notificationTimerRef.current = window.setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, durationMs);
    }
  };

  const dismissNotification = () => {
    clearNotificationTimer();
    setNotification(null);
  };

  useEffect(() => () => clearNotificationTimer(), []);

  // ─── Derived data ─────────────────────────────────────────────────────────

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

  const allItemsMap = useMemo(() =>
    items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {} as Record<string, ParaItem>),
    [items]
  );

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(tx =>
      tx.description.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  const triageItems = useMemo(() =>
    items.filter(i => (i.tags || []).includes('triage-pending')),
    [items]
  );

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

  const activeModule = modules.find(m => m.id === activeType);
  const filteredModuleItems = useMemo(() => {
    if (!activeModule) return [];
    const currentItems = moduleItems[activeModule.id] || [];
    if (!searchQuery.trim()) return currentItems;
    const q = searchQuery.toLowerCase();
    return currentItems.filter(item =>
      item.title.toLowerCase().includes(q) ||
      Object.values(item.data).some(val => String(val).toLowerCase().includes(q))
    );
  }, [moduleItems, activeModule, searchQuery]);

  // ─── AI Chat integration ──────────────────────────────────────────────────

  const { messages, isProcessing, handleSendMessage, handleSendImage, handleChatCompletion, analyzeLife } = useAIChat({
    items, accounts, modules,
    onAddItem: addItem,
    onToggleComplete: toggleComplete,
    onAddTransaction: addTransaction,
    onAddModuleItem: addModuleItem,
    onRefreshFinance: loadFinanceData,
    onRefreshModuleItems: loadModuleItems
  });

  // ─── Item action handlers ─────────────────────────────────────────────────

  const handleToggleComplete = async (id: string, currentStatus: boolean) => {
    const item = items.find(i => i.id === id);
    if (!item) { showNotification('Task not found', 'error'); return; }
    const wasCompleted = !!currentStatus;
    try {
      await toggleComplete(id, currentStatus);
      if (!wasCompleted) {
        const shortTitle = item.title.length > 44 ? `${item.title.slice(0, 44)}...` : item.title;
        showNotification(`Completed: ${shortTitle}`, 'success', {
          durationMs: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              dismissNotification();
              void (async () => {
                try {
                  await toggleComplete(id, true);
                  showNotification(`Reopened: ${shortTitle}`, 'success');
                } catch { showNotification('Undo failed', 'error'); }
              })();
            }
          }
        });
      } else {
        showNotification(`Reopened: ${item.title}`, 'success');
      }
    } catch { showNotification('Failed to update task status', 'error'); }
  };

  // ─── Selection handlers ───────────────────────────────────────────────────

  const handleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectAll = (ids: string[]) => {
    if (selectedIds.size === ids.length && ids.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(ids));
  };

  // ─── Batch handlers ───────────────────────────────────────────────────────

  const handleBatchDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} items?`)) return;
    const ids = Array.from(selectedIds) as string[];
    for (const id of ids) {
      try {
        if (isModuleViewType(activeType)) await deleteModuleItem(id, activeType as string);
        else await deleteItem(id);
      } catch (e) { console.error(e); }
    }
    setSelectedIds(new Set());
    showNotification('Batch delete complete', 'success');
  };

  const handleBatchComplete = async () => {
    const ids = Array.from(selectedIds) as string[];
    for (const id of ids) {
      try { await toggleComplete(id, false); } catch (e) { console.error(e); }
    }
    setSelectedIds(new Set());
    showNotification('Batch complete success', 'success');
  };

  const handleBatchArchive = async () => {
    const ids = Array.from(selectedIds) as string[];
    let count = 0;
    for (const id of ids) {
      try { await archiveItem(id); count++; } catch (e) { console.error(e); }
    }
    setSelectedIds(new Set());
    showNotification(`Archived ${count} items`, 'success');
  };

  // ─── Special action handlers ──────────────────────────────────────────────

  const handleAnalyzeLife = async () => {
    setIsAnalysisModalOpen(true);
    setAnalysisResult('');
    try {
      const result = await analyzeLife(historyLogs, transactions);
      setAnalysisResult(result);
    } catch (e: any) { setAnalysisResult(`Error: ${e.message}`); }
  };

  const handleResolveTriage = async (itemId: string, type: ParaType) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const next: ParaItem = {
      ...item, type,
      tags: (item.tags || []).filter(t => t !== 'triage-pending'),
      updatedAt: new Date().toISOString()
    };
    await updateItem(next);
    showNotification(`Triage resolved as ${type}`, 'success');
  };

  const handleDeleteWrapper = async (id: string) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      if (isModuleViewType(activeType)) await deleteModuleItem(id, activeType as string);
      else await deleteItem(id);
    } catch { showNotification('Failed to delete', 'error'); }
  };

  const handleArchiveWrapper = async (id: string) => {
    try { await archiveItem(id); showNotification('Item moved to Archive', 'success'); }
    catch { showNotification('Failed to archive', 'error'); }
  };

  const handleSavePulseArticle = async (article: PulseArticle) => {
    const normalizedUrl = article.url.trim();
    const duplicate = items.find((item) =>
      item.type === ParaType.RESOURCE &&
      (item.content.includes(normalizedUrl) || item.title.toLowerCase() === article.title.toLowerCase())
    );

    if (duplicate) {
      showNotification('Resource already saved', 'error', {
        durationMs: 4000,
        action: {
          label: 'Open',
          onClick: () => { dismissNotification(); handleViewDetail(duplicate.id); }
        }
      });
      return;
    }

    const now = new Date().toISOString();
    const citationLines = (article.citations || []).slice(0, 3)
      .map((citation, index) => `${index + 1}. ${citation.label}: ${citation.url}`);
    const nextItem: ParaItem = {
      id: generateId(),
      title: article.title,
      content: `${article.summary || ''}\n\nSource: ${article.source}\nPublished: ${article.publishedAt}\nProvider: ${article.provider || 'RSS'}\nLink: ${article.url}${citationLines.length ? `\n\nCitations:\n${citationLines.join('\n')}` : ''}`.trim(),
      type: ParaType.RESOURCE,
      category: article.category || 'News',
      tags: Array.from(new Set(['news', 'world-pulse', 'thailand-pulse', `tier-${article.trustTier.toLowerCase()}`, ...(article.keywords || []).slice(0, 5)])),
      relatedItemIds: [],
      isAiGenerated: true,
      isCompleted: false,
      createdAt: now,
      updatedAt: now
    };

    await addItem(nextItem);
    const shortTitle = article.title.length > 46 ? `${article.title.slice(0, 46)}...` : article.title;
    showNotification(`Saved: ${shortTitle}`, 'success');
  };

  // ─── Modal handlers ───────────────────────────────────────────────────────

  const handleEditItem = (id: string) => {
    const itemToEdit = items.find(i => i.id === id);
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setIsManualModalOpen(true);
      setDetailItem(null);
    }
  };

  const handleViewDetail = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) setDetailItem(item);
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
      } else if (mode === 'TRANSACTION') {
        await addTransaction(data);
        showNotification('Transaction saved', 'success');
      } else if (mode === 'ACCOUNT') {
        await addAccount(data);
        showNotification('Account saved', 'success');
      } else if (mode === 'MODULE') {
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
    } catch { showNotification('Failed to create module', 'error'); }
  };

  const handleModalClose = () => {
    setIsManualModalOpen(false);
    setEditingItem(null);
  };

  // ─── Derived display values ───────────────────────────────────────────────

  const pageTitle = activeModule ? activeModule.name : (
    activeType === 'All' ? 'Dashboard'
    : activeType === 'LifeOverview' ? 'Life Overview'
    : activeType === 'ThailandPulse' ? 'World Pulse'
    : activeType === 'AIConfig' ? 'AI Config'
    : activeType === 'Subscriptions' ? 'Subscriptions'
    : activeType
  );

  const shouldShowFocusDock = activeType !== 'Agent' && activeType !== 'LifeOverview'
    && activeType !== 'ThailandPulse' && activeType !== 'AIConfig'
    && activeType !== 'Subscriptions';

  // ─── Return everything App.tsx needs ─────────────────────────────────────

  return {
    // data
    items, historyLogs, isLoadingDB, exportData, importData,
    accounts, transactions, addTransaction, addAccount,
    subscriptions, isLoadingSubscriptions, addSubscription, updateSubscription, deleteSubscription,
    modules, moduleItems,
    isLoadingAgentData, isRunningAgent, agentError, agentRuns, captureKpis, latestSummary,
    refreshAgentData, triggerDailyRun,
    // AI chat
    messages, isProcessing, handleSendMessage, handleSendImage, handleChatCompletion,
    // ui state + setters
    activeType, setActiveType,
    viewMode, setViewMode,
    isChatOpen, setIsChatOpen,
    isChatCompact, setIsChatCompact,
    isDesktopViewport,
    selectedIds, setSelectedIds,
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
    notification, showNotification, dismissNotification,
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
  };
}
