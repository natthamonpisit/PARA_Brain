import { ParaItem, HistoryLog, ParaType } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

// --- HELPERS: MAPPING ---

// Convert App Model (camelCase) to DB Model (snake_case)
const toDb = (item: ParaItem) => {
  const dbItem: any = {
    id: item.id,
    title: item.title,
    content: item.content,
    type: item.type,
    category: item.category,
    tags: item.tags,
    related_item_ids: item.relatedItemIds,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    is_ai_generated: item.isAiGenerated,
  };

  // Only add is_completed for tasks to avoid schema errors if columns don't exist on other tables
  if (item.type === ParaType.TASK) {
    dbItem.is_completed = item.isCompleted;
  }

  return dbItem;
};

// Convert DB Model (snake_case) to App Model (camelCase)
const fromDb = (row: any): ParaItem => ({
  id: row.id,
  title: row.title,
  content: row.content,
  type: row.type as ParaType,
  category: row.category,
  tags: row.tags || [],
  relatedItemIds: row.related_item_ids || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isAiGenerated: row.is_ai_generated,
  isCompleted: row.is_completed,
});

// Map ParaType to specific Supabase Tables
const getTableForType = (type: ParaType): string => {
  switch (type) {
    case ParaType.PROJECT: return 'projects';
    case ParaType.AREA: return 'areas';
    case ParaType.TASK: return 'tasks';
    case ParaType.RESOURCE: return 'resources'; 
    case ParaType.ARCHIVE: return 'archives';   
    default: return 'projects'; 
  }
};

// --- LOCAL STORAGE HELPERS ---
const LOCAL_KEY = 'para_db_v1';

interface LocalDB {
    items: ParaItem[];
    history: HistoryLog[];
}

const getLocal = (): LocalDB => {
    try {
        const str = localStorage.getItem(LOCAL_KEY);
        return str ? JSON.parse(str) : { items: [], history: [] };
    } catch { return { items: [], history: [] } }
};

const setLocal = (data: LocalDB) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
};

export const db = {
  // Fetch all items from all PARA tables
  async getAll(): Promise<ParaItem[]> {
    if (!isSupabaseConfigured) {
        return getLocal().items;
    }

    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives'];
    
    try {
      const results = await Promise.all(
        tables.map(table => supabase.from(table).select('*'))
      );

      const allItems: ParaItem[] = [];
      
      results.forEach((result, index) => {
        if (result.error) {
          console.warn(`Failed to fetch from ${tables[index]}:`, result.error.message);
        }
        if (result.data) {
          result.data.forEach((row: any) => {
            allItems.push(fromDb(row));
          });
        }
      });

      return allItems;
    } catch (e) {
      console.error("Supabase fetch error:", e);
      return [];
    }
  },

  // Add or Update (Upsert)
  async add(item: ParaItem): Promise<void> {
    if (!isSupabaseConfigured) {
        const data = getLocal();
        const index = data.items.findIndex((i: ParaItem) => i.id === item.id);
        if (index >= 0) {
            data.items[index] = item;
        } else {
            data.items.push(item);
        }
        setLocal(data);
        return;
    }

    const table = getTableForType(item.type);
    const dbItem = toDb(item);

    const { error } = await supabase
      .from(table)
      .upsert(dbItem);

    if (error) {
      console.error(`Supabase Upsert Error (${table}):`, error);
      throw new Error(error.message);
    }
  },

  // Delete Item (Requires Type to identify table)
  async delete(id: string, type: ParaType): Promise<void> {
    if (!isSupabaseConfigured) {
        const data = getLocal();
        data.items = data.items.filter((i: ParaItem) => i.id !== id);
        setLocal(data);
        return;
    }

    const table = getTableForType(type);
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  },

  // Clear all data (Dangerous - for Restore functionality)
  async clear(): Promise<void> {
    if (!isSupabaseConfigured) {
        localStorage.removeItem(LOCAL_KEY);
        return;
    }

    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives', 'history'];
    
    // Supabase requires a WHERE clause for delete. 
    // Using id.neq.000... is a common pattern to delete all if you don't have a better condition
    await Promise.all(
      tables.map(table => 
        supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      )
    );
  },

  // Import helper
  async bulkAdd(items: ParaItem[]): Promise<void> {
    if (!isSupabaseConfigured) {
        const data = getLocal();
        // naive merge
        items.forEach(newItem => {
             const index = data.items.findIndex((i: ParaItem) => i.id === newItem.id);
             if (index >= 0) data.items[index] = newItem;
             else data.items.push(newItem);
        });
        setLocal(data);
        return;
    }

    // Process in parallel or serial? Serial is safer for constraints.
    for (const item of items) {
      await this.add(item);
    }
  },
  
  // Seed initial data if DB is empty
  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
    const current = await this.getAll();
    if (current.length === 0) {
      console.log("Seeding database...");
      await this.bulkAdd(initialItems); 
      return initialItems;
    }
    return current;
  },

  // --- HISTORY OPERATIONS ---

  async addLog(log: HistoryLog): Promise<void> {
    if (!isSupabaseConfigured) {
        const data = getLocal();
        data.history.push(log);
        setLocal(data);
        return;
    }

    const dbLog = {
      id: log.id,
      action: log.action,
      item_title: log.itemTitle,
      item_type: log.itemType,
      timestamp: log.timestamp
    };
    
    const { error } = await supabase.from('history').insert(dbLog);
    if (error) console.error('Failed to log history', error);
  },

  async getLogs(): Promise<HistoryLog[]> {
    if (!isSupabaseConfigured) {
        return getLocal().history.sort((a: HistoryLog, b: HistoryLog) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    const { data, error } = await supabase
      .from('history')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      action: row.action,
      itemTitle: row.item_title,
      itemType: row.item_type,
      timestamp: row.timestamp
    }));
  }
};