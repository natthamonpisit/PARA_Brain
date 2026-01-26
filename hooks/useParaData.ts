
import { useState, useEffect, useCallback } from 'react';
import { ParaItem, HistoryLog, ParaType, HistoryAction } from '../types';
import { db, fromDb } from '../services/db';
import { supabase } from '../services/supabase';
import { generateId } from '../utils/helpers';

const INITIAL_ITEMS: ParaItem[] = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
    title: 'Launch Personal Website',
    content: 'Need to finish the landing page and connect the contact form.',
    type: ParaType.PROJECT,
    category: 'Coding',
    tags: ['web', 'react'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
    title: 'Weekly Cardio Routine',
    content: 'Run 5km every Monday, Wednesday, and Friday.',
    type: ParaType.AREA,
    category: 'Health',
    tags: ['running', 'habit'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
    title: 'React 18 Concurrent Mode Notes',
    content: 'Key concepts: `useTransition`, `useDeferredValue`. Helps with UI responsiveness.',
    type: ParaType.RESOURCE,
    category: 'Dev Knowledge',
    tags: ['react', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
      title: 'Fix Navigation Bug',
      content: 'Mobile menu is not closing on selection.',
      type: ParaType.TASK,
      category: 'Coding',
      tags: ['bug', 'ui'],
      relatedItemIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'], 
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

  // --- REALTIME SUBSCRIPTION (LIVE SYNC) ---
  useEffect(() => {
    const channel = supabase
      .channel('para-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          // Check if the change is in one of our PARA tables
          if (['projects', 'areas', 'tasks', 'resources', 'archives'].includes(payload.table)) {
             
             if (payload.eventType === 'INSERT') {
                 const row = payload.new as any;
                 // Fallback: If 'type' is missing in row, try to infer from table name
                 if (!row.type) {
                      const typeMap: Record<string, ParaType> = {
                          'projects': ParaType.PROJECT,
                          'areas': ParaType.AREA,
                          'tasks': ParaType.TASK,
                          'resources': ParaType.RESOURCE,
                          'archives': ParaType.ARCHIVE
                      };
                      row.type = typeMap[payload.table];
                 }

                 const newItem = fromDb(row);
                 setItems(prev => {
                     // Prevent duplicate (optimistic update vs realtime race)
                     if (prev.find(i => i.id === newItem.id)) return prev;
                     return [newItem, ...prev];
                 });

             } else if (payload.eventType === 'UPDATE') {
                 const row = payload.new as any;
                 // Ensure type exists
                 if (!row.type) {
                      const typeMap: Record<string, ParaType> = {
                          'projects': ParaType.PROJECT,
                          'areas': ParaType.AREA,
                          'tasks': ParaType.TASK,
                          'resources': ParaType.RESOURCE,
                          'archives': ParaType.ARCHIVE
                      };
                      row.type = typeMap[payload.table];
                 }
                 const updatedItem = fromDb(row);
                 setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));

             } else if (payload.eventType === 'DELETE') {
                 setItems(prev => prev.filter(i => i.id !== payload.old.id));
             }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    // Optimistic Update
    setItems(prev => [item, ...prev]);
    
    try {
        await db.add(item);
        await logHistory('CREATE', item);
    } catch (e) {
        // Rollback on error
        setItems(prev => prev.filter(i => i.id !== item.id));
        console.error("Failed to add item:", e);
    }
    return item;
  };

  const deleteItem = async (id: string) => {
    const itemToDelete = items.find(i => i.id === id);
    if (!itemToDelete) return;
    
    // Optimistic Update
    setItems(prev => prev.filter(i => i.id !== id));

    try {
        await logHistory('DELETE', itemToDelete);
        await db.delete(id, itemToDelete.type);
    } catch (e) {
        // Rollback
        setItems(prev => [itemToDelete, ...prev]);
        console.error("Failed to delete item:", e);
    }
  };

  const updateItem = async (updatedItem: ParaItem) => {
    // Optimistic
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    
    try {
        await db.add(updatedItem); 
    } catch (e) {
        console.error("Failed to update item:", e);
    }
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

  const archiveItem = async (id: string) => {
    const itemToArchive = items.find(i => i.id === id);
    if (!itemToArchive) return;

    // Local Optimistic Remove (will be re-added as Archive via Realtime or Manual refresh in worst case)
    // Actually, for cross-table move, optimistic update is tricky. 
    // Let's rely on DB logic + reload/realtime.
    
    await db.delete(id, itemToArchive.type);
    
    const archivedItem: ParaItem = {
        ...itemToArchive,
        type: ParaType.ARCHIVE,
        updatedAt: new Date().toISOString()
    };

    await db.add(archivedItem);
    await logHistory('UPDATE', archivedItem);
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
    updateItem,
    deleteItem,
    toggleComplete,
    archiveItem,
    exportData,
    importData,
    loadData
  };
};
