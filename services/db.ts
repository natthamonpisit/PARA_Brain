
import { ParaItem, HistoryLog, ParaType, FinanceAccount, Transaction, TransactionType, FinanceAccountType, AppModule, ModuleItem, DailySummary, Subscription, BillingCycle, SubscriptionStatus } from '../types';
import { supabase } from './supabase';

// --- HELPERS: MAPPING ---

// Convert App Model (camelCase) to DB Model (snake_case)
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

// Convert DB Model (snake_case) to App Model (camelCase)
export const fromDb = (row: any): ParaItem => {
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
    emoji: row.emoji,
    dueDate: row.due_date,
    deadline: row.deadline,
    status: row.status,
    energyLevel: row.energy_level,
    attachments: row.attachments || []
  };
};

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
  // --- FILE STORAGE ---
  async uploadFile(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    // Upload to 'attachments' bucket
    const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

    if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get Public URL
    const { data } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

    return data.publicUrl;
  },

  // --- PARA MODULE ---
  async getAll(): Promise<ParaItem[]> {
    const tables = ['projects', 'areas', 'tasks', 'resources', 'archives'];
    const allItems: ParaItem[] = [];
    
    // Execute all requests in parallel but catch errors individually to avoid failing everything
    await Promise.all(
      tables.map(async (table) => {
        try {
          const { data, error } = await supabase.from(table).select('*');
          if (error) {
            // console.warn(`Warning: Could not fetch table '${table}'`, error.message);
            return;
          }
          if (data) {
             data.forEach((row: any) => {
                if (row.id) {
                     // Fallback type if DB doesn't have it
                     if (!row.type) {
                         const typeMap: Record<string, ParaType> = {
                             'projects': ParaType.PROJECT,
                             'areas': ParaType.AREA,
                             'tasks': ParaType.TASK,
                             'resources': ParaType.RESOURCE,
                             'archives': ParaType.ARCHIVE
                         };
                         row.type = typeMap[table];
                     }
                     allItems.push(fromDb(row));
                }
             });
          }
        } catch (e) {
          console.error(`Critical error fetching ${table}:`, e);
        }
      })
    );

    return allItems;
  },

  async add(item: ParaItem): Promise<void> {
    const table = getTableForType(item.type);
    const dbItem = toDb(item);
    const { error } = await supabase.from(table).upsert(dbItem);
    if (error) throw new Error(error.message);
  },

  async delete(id: string, type: ParaType): Promise<void> {
    const table = getTableForType(type);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // --- FINANCE MODULE ---

  async getAccounts(): Promise<FinanceAccount[]> {
    const { data, error } = await supabase.from('accounts').select('*').order('name');
    if (error) {
        // console.warn("Could not fetch accounts:", error.message);
        return [];
    }
    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type as FinanceAccountType,
      balance: row.balance,
      currency: row.currency,
      isIncludeNetWorth: row.is_include_net_worth
    }));
  },

  async getTransactions(limit?: number): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (typeof limit === 'number') {
      query = query.limit(limit);
    }

    const { data, error } = await query;
        
    if (error) {
        // console.warn("Could not fetch transactions:", error.message);
        return [];
    }
    return data.map((row: any) => ({
      id: row.id,
      description: row.description,
      amount: row.amount,
      type: row.type as TransactionType,
      category: row.category,
      accountId: row.account_id,
      projectId: row.project_id,
      transactionDate: row.transaction_date
    }));
  },

  async addTransaction(tx: Transaction): Promise<void> {
      const dbTx = {
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          account_id: tx.accountId,
          project_id: tx.projectId,
          transaction_date: tx.transactionDate
      };
      const { error } = await supabase.from('transactions').insert(dbTx);
      if (error) throw new Error(error.message);
  },

  async addAccount(account: FinanceAccount): Promise<void> {
      const dbAcc = {
          id: account.id,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
          is_include_net_worth: account.isIncludeNetWorth
      };
      const { error } = await supabase.from('accounts').upsert(dbAcc);
      if (error) throw new Error(error.message);
  },

  async bulkAddAccounts(accounts: FinanceAccount[]): Promise<void> {
    const dbAccounts = accounts.map(account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      is_include_net_worth: account.isIncludeNetWorth
    }));
    if (dbAccounts.length === 0) return;
    const { error } = await supabase.from('accounts').upsert(dbAccounts);
    if (error) throw new Error(error.message);
  },

  async bulkAddTransactions(transactions: Transaction[]): Promise<void> {
    const dbTransactions = transactions.map(tx => ({
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      account_id: tx.accountId,
      project_id: tx.projectId,
      transaction_date: tx.transactionDate
    }));
    if (dbTransactions.length === 0) return;
    const { error } = await supabase.from('transactions').insert(dbTransactions);
    if (error) throw new Error(error.message);
  },

  // --- DYNAMIC MODULES (PLATFORM ENGINE) ---

  async getModules(): Promise<AppModule[]> {
      const { data, error } = await supabase.from('modules').select('*').order('created_at');
      if (error) {
          // console.warn("Could not fetch modules:", error.message);
          return [];
      }
      return data.map((row: any) => ({
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          icon: row.icon,
          schemaConfig: row.schema_config
      }));
  },

  async createModule(module: AppModule): Promise<void> {
      const dbMod = {
          id: module.id,
          key: module.key,
          name: module.name,
          description: module.description,
          icon: module.icon,
          schema_config: module.schemaConfig
      };
      const { error } = await supabase.from('modules').insert(dbMod);
      if (error) throw new Error(error.message);
  },

  async getModuleItems(moduleId: string): Promise<ModuleItem[]> {
      const { data, error } = await supabase
          .from('module_items')
          .select('*')
          .eq('module_id', moduleId)
          .order('created_at', { ascending: false });
      
      if (error) {
          // console.warn("Could not fetch module items:", error.message);
          return [];
      }
      return data.map((row: any) => ({
          id: row.id,
          moduleId: row.module_id,
          title: row.title,
          data: row.data,
          tags: row.tags || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at
      }));
  },

  async addModuleItem(item: ModuleItem): Promise<void> {
      const dbItem = {
          id: item.id,
          module_id: item.moduleId,
          title: item.title,
          data: item.data,
          tags: item.tags
      };
      const { error } = await supabase.from('module_items').insert(dbItem);
      if (error) throw new Error(error.message);
  },

  async deleteModuleItem(id: string): Promise<void> {
      const { error } = await supabase.from('module_items').delete().eq('id', id);
      if (error) throw new Error(error.message);
  },

  // --- COMMON & UTILS ---

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
  },

  async bulkAdd(items: ParaItem[]): Promise<void> {
    const promises = items.map(item => this.add(item).catch(e => console.error(`Failed to add item ${item.title}:`, e)));
    await Promise.all(promises);
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

  async getExportSnapshot(): Promise<{
    items: ParaItem[];
    history: HistoryLog[];
    accounts: FinanceAccount[];
    transactions: Transaction[];
  }> {
    const [items, history, accounts, transactions] = await Promise.all([
      this.getAll(),
      this.getLogs(),
      this.getAccounts(),
      this.getTransactions()
    ]);
    return { items, history, accounts, transactions };
  },
  
  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
    const current = await this.getAll();
    if (current.length === 0) {
        console.log("[DB] Database appears empty. Seeding initial data...");
        try {
            await this.bulkAdd(initialItems);
            // Return initial items so UI updates immediately
            return initialItems; 
        } catch (e) {
            console.error("[DB] Seeding failed:", e);
        }
    }
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
    if (error) console.error('Failed to log history:', error);
  },

  async getLogs(startDate?: string): Promise<HistoryLog[]> {
    let query = supabase
      .from('history')
      .select('*')
      .order('timestamp', { ascending: false });
    
    if (startDate) {
        query = query.gte('timestamp', startDate);
    }

    const { data, error } = await query;

    if (error) return [];
    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      action: row.action,
      itemTitle: row.item_title,
      itemType: row.item_type,
      timestamp: row.timestamp
    }));
  },

  // --- DAILY SUMMARY MEMORY ---

  async getRecentSummaries(limit = 7): Promise<DailySummary[]> {
    const { data, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit);

    if (error) return [];
    return data as DailySummary[];
  },

  async getSummaryByDate(dateStr: string): Promise<DailySummary | null> {
    const { data, error } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('date', dateStr)
        .maybeSingle(); // maybeSingle returns null if not found, instead of error

    if (error) return null;
    return data as DailySummary;
  },

  async addDailySummary(summary: DailySummary): Promise<void> {
      const { error } = await supabase.from('daily_summaries').upsert(summary);
      if (error) throw new Error(error.message);
  },

  // --- SUBSCRIPTIONS ---

  async getSubscriptions(): Promise<Subscription[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('renewal_date', { ascending: true });
    if (error) return [];
    return (data || []).map((row: any): Subscription => ({
      id: row.id,
      name: row.name,
      category: row.category,
      costMonthly: Number(row.cost_monthly),
      billingAmount: Number(row.billing_amount),
      billingCycle: row.billing_cycle as BillingCycle,
      currency: row.currency,
      startDate: row.start_date ?? undefined,
      renewalDate: row.renewal_date,
      status: row.status as SubscriptionStatus,
      website: row.website ?? undefined,
      accountEmail: row.account_email ?? undefined,
      notes: row.notes ?? undefined,
      autoRenew: row.auto_renew,
      reminderDays: row.reminder_days,
      linkedAccountId: row.linked_account_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addSubscription(sub: Subscription): Promise<void> {
    const { error } = await supabase.from('subscriptions').insert({
      id: sub.id,
      name: sub.name,
      category: sub.category,
      cost_monthly: sub.costMonthly,
      billing_amount: sub.billingAmount,
      billing_cycle: sub.billingCycle,
      currency: sub.currency,
      start_date: sub.startDate ?? null,
      renewal_date: sub.renewalDate,
      status: sub.status,
      website: sub.website ?? null,
      account_email: sub.accountEmail ?? null,
      notes: sub.notes ?? null,
      auto_renew: sub.autoRenew,
      reminder_days: sub.reminderDays,
      linked_account_id: sub.linkedAccountId ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async updateSubscription(sub: Subscription): Promise<void> {
    const { error } = await supabase.from('subscriptions').update({
      name: sub.name,
      category: sub.category,
      cost_monthly: sub.costMonthly,
      billing_amount: sub.billingAmount,
      billing_cycle: sub.billingCycle,
      currency: sub.currency,
      start_date: sub.startDate ?? null,
      renewal_date: sub.renewalDate,
      status: sub.status,
      website: sub.website ?? null,
      account_email: sub.accountEmail ?? null,
      notes: sub.notes ?? null,
      auto_renew: sub.autoRenew,
      reminder_days: sub.reminderDays,
      linked_account_id: sub.linkedAccountId ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id);
    if (error) throw new Error(error.message);
  },

  async deleteSubscription(id: string): Promise<void> {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
