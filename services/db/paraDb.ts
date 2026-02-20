// ─── paraDb ───────────────────────────────────────────────────────────────────
// PARA items, history logs, attachments, export snapshot, and seed helpers.

import { ParaItem, ParaType, HistoryLog } from '../../types';
import { supabase } from '../supabase';

// ─── camelCase ↔ snake_case mappers ──────────────────────────────────────────

export const toDb = (item: ParaItem) => {
  const dbItem: any = {
    id: item.id,
    content: item.content,
    type: item.type,
    category: item.category,
    tags: item.tags,
    related_item_ids: item.relatedItemIds,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    is_ai_generated: item.isAiGenerated,
    is_completed: item.isCompleted,
    attachments: item.attachments || []
  };

  if (item.type === ParaType.AREA) {
    dbItem.name = item.title;
    dbItem.title = item.title;
    if (item.emoji) dbItem.emoji = item.emoji;
  } else {
    dbItem.title = item.title;
  }

  if (item.type === ParaType.TASK) {
    if (item.dueDate) dbItem.due_date = item.dueDate;
    if (item.energyLevel) dbItem.energy_level = item.energyLevel;
  }

  if (item.type === ParaType.PROJECT) {
    if (item.deadline) dbItem.deadline = item.deadline;
    if (item.status) dbItem.status = item.status;
  }

  return dbItem;
};

export const fromDb = (row: any): ParaItem => ({
  id: row.id,
  title: row.title || row.name || 'Untitled',
  content: row.content || '',
  type: row.type as ParaType,
  category: row.category || 'General',
  tags: row.tags || [],
  relatedItemIds: row.related_item_ids || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isAiGenerated: row.is_ai_generated,
  isCompleted: row.is_completed,
  emoji: row.emoji,
  dueDate: row.due_date,
  deadline: row.deadline,
  status: row.status,
  energyLevel: row.energy_level,
  attachments: row.attachments || []
});

const TABLE_MAP: Record<ParaType, string> = {
  [ParaType.PROJECT]:  'projects',
  [ParaType.AREA]:     'areas',
  [ParaType.TASK]:     'tasks',
  [ParaType.RESOURCE]: 'resources',
  [ParaType.ARCHIVE]:  'archives',
};

const getTableForType = (type: ParaType): string => TABLE_MAP[type] ?? 'projects';

// ─── PARA CRUD ────────────────────────────────────────────────────────────────

export const paraDb = {
  async getAll(): Promise<ParaItem[]> {
    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives'];
    const allItems: ParaItem[] = [];

    await Promise.all(
      tables.map(async (table) => {
        try {
          const { data, error } = await supabase.from(table).select('*');
          if (error || !data) return;
          data.forEach((row: any) => {
            if (!row.id) return;
            if (!row.type) {
              const typeMap: Record<string, ParaType> = {
                projects: ParaType.PROJECT,
                areas:    ParaType.AREA,
                tasks:    ParaType.TASK,
                resources: ParaType.RESOURCE,
                archives:  ParaType.ARCHIVE
              };
              row.type = typeMap[table];
            }
            allItems.push(fromDb(row));
          });
        } catch (e) {
          console.error(`Critical error fetching ${table}:`, e);
        }
      })
    );

    return allItems;
  },

  async add(item: ParaItem): Promise<void> {
    const table = getTableForType(item.type);
    const { error } = await supabase.from(table).upsert(toDb(item));
    if (error) throw new Error(error.message);
  },

  async delete(id: string, type: ParaType): Promise<void> {
    const table = getTableForType(type);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async bulkAdd(items: ParaItem[]): Promise<void> {
    await Promise.all(
      items.map(item => this.add(item).catch(e => console.error(`Failed to add item ${item.title}:`, e)))
    );
  },

  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
    const current = await this.getAll();
    if (current.length === 0) {
      console.log('[DB] Database appears empty. Seeding initial data...');
      try {
        await this.bulkAdd(initialItems);
        return initialItems;
      } catch (e) {
        console.error('[DB] Seeding failed:', e);
      }
    }
    return current;
  },

  // ── File storage ─────────────────────────────────────────────────────────

  async uploadFile(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(fileName, file);
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data } = supabase.storage.from('attachments').getPublicUrl(fileName);
    return data.publicUrl;
  },

  // ── History logs ──────────────────────────────────────────────────────────

  async addLog(log: HistoryLog): Promise<void> {
    const dbLog = {
      id: log.id,
      action: log.action,
      item_title: log.itemTitle,
      item_type: log.itemType,
      timestamp: log.timestamp
    };
    const { error } = await supabase.from('history').insert(dbLog);
    if (error) console.error('Failed to log history:', error);
  },

  async getLogs(startDate?: string): Promise<HistoryLog[]> {
    let query = supabase
      .from('history')
      .select('*')
      .order('timestamp', { ascending: false });
    if (startDate) query = query.gte('timestamp', startDate);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id,
      action: row.action,
      itemTitle: row.item_title,
      itemType: row.item_type,
      timestamp: row.timestamp
    }));
  },

  async bulkAddLogs(logs: HistoryLog[]): Promise<void> {
    const dbLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      item_title: log.itemTitle,
      item_type: log.itemType,
      timestamp: log.timestamp
    }));
    if (dbLogs.length === 0) return;
    const { error } = await supabase.from('history').insert(dbLogs);
    if (error) throw new Error(error.message);
  },

  // ── Clear ─────────────────────────────────────────────────────────────────

  async clearParaAndHistory(): Promise<void> {
    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives', 'history'];
    const results = await Promise.all(
      tables.map(table =>
        supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      )
    );
    results.forEach((res, idx) => {
      if (res.error) console.error(`Failed to clear table ${tables[idx]}:`, res.error);
    });
  }
};
