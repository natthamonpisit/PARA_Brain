import { ParaItem, HistoryLog, ParaType } from '../types';
import { supabase } from './supabase';

// --- HELPERS: MAPPING ---

// Convert App Model (camelCase) to DB Model (snake_case)
const toDb = (item: ParaItem) => {
  const dbItem: any = {
    id: item.id,
    // Base fields common to most
    content: item.content,
    type: item.type,
    category: item.category, 
    tags: item.tags,
    related_item_ids: item.relatedItemIds,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    is_ai_generated: item.isAiGenerated,
    is_completed: item.isCompleted,
  };

  // SCHEMA FIX: Handle specific table constraints based on inspection
  
  // 1. Areas table requires 'name' (not null), 'title' is nullable
  if (item.type === ParaType.AREA) {
    dbItem.name = item.title;
    dbItem.title = item.title; // Save to both for consistency if schema allows
    if (item.emoji) dbItem.emoji = item.emoji;
  } else {
    // Other tables use 'title' as primary non-nullable
    dbItem.title = item.title;
  }

  // 2. Tasks specific fields
  if (item.type === ParaType.TASK) {
    if (item.dueDate) dbItem.due_date = item.dueDate;
    if (item.energyLevel) dbItem.energy_level = item.energyLevel;
  }

  // 3. Projects specific fields
  if (item.type === ParaType.PROJECT) {
    if (item.deadline) dbItem.deadline = item.deadline;
    if (item.status) dbItem.status = item.status;
  }

  return dbItem;
};

// Convert DB Model (snake_case) to App Model (camelCase)
const fromDb = (row: any): ParaItem => {
  // SCHEMA FIX: Handle 'name' vs 'title' for Areas
  const title = row.title || row.name || 'Untitled';
  
  return {
    id: row.id,
    title: title,
    content: row.content || '',
    type: row.type as ParaType,
    category: row.category || 'General',
    tags: row.tags || [],
    relatedItemIds: row.related_item_ids || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAiGenerated: row.is_ai_generated,
    isCompleted: row.is_completed,
    
    // Optional extended fields
    emoji: row.emoji,
    dueDate: row.due_date,
    deadline: row.deadline,
    status: row.status,
    energyLevel: row.energy_level
  };
};

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

export const db = {
  // Fetch all items from all PARA tables
  async getAll(): Promise<ParaItem[]> {
    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives'];
    
    try {
      const results = await Promise.all(
        tables.map(table => supabase.from(table).select('*'))
      );

      const allItems: ParaItem[] = [];
      
      results.forEach((result, index) => {
        if (result.error) {
          console.error(`Supabase Error (${tables[index]}):`, result.error);
        }
        if (result.data) {
          result.data.forEach((row: any) => {
            if (row.id) {
                // Determine type from table name if column is missing (fallback)
                if (!row.type) {
                    const typeMap: Record<string, ParaType> = {
                        'projects': ParaType.PROJECT,
                        'areas': ParaType.AREA,
                        'tasks': ParaType.TASK,
                        'resources': ParaType.RESOURCE,
                        'archives': ParaType.ARCHIVE
                    };
                    row.type = typeMap[tables[index]];
                }
                allItems.push(fromDb(row));
            }
          });
        }
      });

      return allItems;
    } catch (e) {
      console.error("Supabase Critical Connection Error:", e);
      throw e; 
    }
  },

  // Add or Update (Upsert)
  async add(item: ParaItem): Promise<void> {
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
    const table = getTableForType(type);
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Supabase Delete Error (${table}):`, error);
      throw new Error(error.message);
    }
  },

  // Clear all data (Dangerous - for Restore functionality)
  async clear(): Promise<void> {
    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives', 'history'];
    
    const results = await Promise.all(
      tables.map(table => 
        supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      )
    );

    results.forEach((res, idx) => {
        if (res.error) console.error(`Failed to clear table ${tables[idx]}:`, res.error);
    });
  },

  // Import helper
  async bulkAdd(items: ParaItem[]): Promise<void> {
    const promises = items.map(item => this.add(item).catch(e => console.error(`Failed to add item ${item.title}:`, e)));
    await Promise.all(promises);
  },
  
  // Seed initial data if DB is empty
  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
    const current = await this.getAll();
    return current;
  },

  // --- HISTORY OPERATIONS ---

  async addLog(log: HistoryLog): Promise<void> {
    const dbLog = {
      id: log.id,
      action: log.action,
      item_title: log.itemTitle,
      item_type: log.itemType,
      timestamp: log.timestamp
    };
    
    const { error } = await supabase.from('history').insert(dbLog);
    if (error) console.error('Failed to log history to Supabase:', error);
  },

  async getLogs(): Promise<HistoryLog[]> {
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
        console.error("Supabase History Fetch Error:", error);
        return [];
    }
    
    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      action: row.action,
      itemTitle: row.item_title,
      itemType: row.item_type,
      timestamp: row.timestamp
    }));
  }
};