import { useState, useEffect, useCallback } from 'react';
import { ParaItem, HistoryLog, ParaType, HistoryAction } from '../types';
import { db } from '../services/db';
import { generateId } from '../utils/helpers';

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
  },
  {
      id: '4',
      title: 'Fix Navigation Bug',
      content: 'Mobile menu is not closing on selection.',
      type: ParaType.TASK,
      category: 'Coding',
      tags: ['bug', 'ui'],
      relatedItemIds: ['1'], 
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
  }
];

export const useParaData = () => {
  const [items, setItems] = useState<ParaItem[]>([]);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // --- Core Data Loading ---
  const loadData = useCallback(async () => {
    try {
      setIsLoadingDB(true);
      // seedIfEmpty checks if Supabase is empty, if so inserts INITIAL_ITEMS, otherwise returns fetched data
      const data = await db.seedIfEmpty(INITIAL_ITEMS);
      
      // Sort by newest first
      const sorted = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(sorted);
      
      const logs = await db.getLogs();
      setHistoryLogs(logs);
    } catch (e) {
      console.error("Failed to load DB:", e);
      setDbError('Database Error');
    } finally {
      setIsLoadingDB(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Internal Helper for Logging ---
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

  // --- CRUD Operations ---
  
  const addItem = async (item: ParaItem) => {
    await db.add(item);
    await logHistory('CREATE', item);
    setItems(prev => [item, ...prev]);
    return item;
  };

  const deleteItem = async (id: string) => {
    const itemToDelete = items.find(i => i.id === id);
    if (!itemToDelete) return;
    
    await logHistory('DELETE', itemToDelete);
    // CRITICAL UPDATE: Supabase needs the type to know which table to delete from
    await db.delete(id, itemToDelete.type);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = async (updatedItem: ParaItem) => {
    await db.add(updatedItem); // Uses upsert logic
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
  };

  const toggleComplete = async (id: string, currentStatus: boolean) => {
    const itemToUpdate = items.find(i => i.id === id);
    if (!itemToUpdate) throw new Error("Item not found");

    const updatedItem = { 
      ...itemToUpdate, 
      isCompleted: !currentStatus, 
      updatedAt: new Date().toISOString() 
    };

    await updateItem(updatedItem);
    await logHistory(updatedItem.isCompleted ? 'COMPLETE' : 'UPDATE', updatedItem);
    return updatedItem;
  };

  // --- Import / Export ---

  const exportData = async () => {
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
  };

  const importData = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const newItems = Array.isArray(parsed) ? parsed : parsed.items;
          
          setIsLoadingDB(true);
          await db.clear(); // Clears all tables
          await db.bulkAdd(newItems);
          await loadData();
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  };

  return {
    items,
    historyLogs,
    isLoadingDB,
    dbError,
    addItem,
    deleteItem,
    toggleComplete,
    exportData,
    importData,
    loadData
  };
};