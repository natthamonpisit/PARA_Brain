// ─── services/db/index.ts ─────────────────────────────────────────────────────
// Re-exports all sub-modules and provides the backward-compatible `db` object
// so existing callers (services/db.ts importers) keep working without changes.

export { paraDb, toDb, fromDb } from './paraDb';
export { financeDb } from './financeDb';
export { subscriptionsDb } from './subscriptionsDb';
export { moduleDb } from './moduleDb';

import { paraDb } from './paraDb';
import { financeDb } from './financeDb';
import { subscriptionsDb } from './subscriptionsDb';
import { moduleDb } from './moduleDb';
import type { ParaItem, HistoryLog, FinanceAccount, Transaction, DailySummary } from '../../types';

// ── Backward-compatible aggregate object ──────────────────────────────────────
// All callers that import `import { db } from '../services/db'` continue to work.
export const db = {
  // Para
  uploadFile:        (file: File) => paraDb.uploadFile(file),
  getAll:            () => paraDb.getAll(),
  add:               (item: Parameters<typeof paraDb.add>[0]) => paraDb.add(item),
  delete:            (id: string, type: Parameters<typeof paraDb.delete>[1]) => paraDb.delete(id, type),
  bulkAdd:           (items: ParaItem[]) => paraDb.bulkAdd(items),
  seedIfEmpty:       (items: ParaItem[]) => paraDb.seedIfEmpty(items),
  clearParaAndHistory: () => paraDb.clearParaAndHistory(),
  addLog:            (log: HistoryLog) => paraDb.addLog(log),
  getLogs:           (startDate?: string) => paraDb.getLogs(startDate),
  bulkAddLogs:       (logs: HistoryLog[]) => paraDb.bulkAddLogs(logs),

  // Finance
  getAccounts:       () => financeDb.getAccounts(),
  addAccount:        (account: FinanceAccount) => financeDb.addAccount(account),
  bulkAddAccounts:   (accounts: FinanceAccount[]) => financeDb.bulkAddAccounts(accounts),
  getTransactions:   (limit?: number) => financeDb.getTransactions(limit),
  addTransaction:    (tx: Transaction) => financeDb.addTransaction(tx),
  bulkAddTransactions: (txs: Transaction[]) => financeDb.bulkAddTransactions(txs),
  getRecentSummaries: (limit?: number) => financeDb.getRecentSummaries(limit),
  getSummaryByDate:  (dateStr: string) => financeDb.getSummaryByDate(dateStr),
  addDailySummary:   (summary: DailySummary) => financeDb.addDailySummary(summary),

  // Subscriptions
  getSubscriptions:   () => subscriptionsDb.getSubscriptions(),
  addSubscription:    (sub: Parameters<typeof subscriptionsDb.addSubscription>[0]) => subscriptionsDb.addSubscription(sub),
  updateSubscription: (sub: Parameters<typeof subscriptionsDb.updateSubscription>[0]) => subscriptionsDb.updateSubscription(sub),
  deleteSubscription: (id: string) => subscriptionsDb.deleteSubscription(id),

  // Modules
  getModules:       () => moduleDb.getModules(),
  createModule:     (module: Parameters<typeof moduleDb.createModule>[0]) => moduleDb.createModule(module),
  getModuleItems:   (moduleId: string) => moduleDb.getModuleItems(moduleId),
  addModuleItem:    (item: Parameters<typeof moduleDb.addModuleItem>[0]) => moduleDb.addModuleItem(item),
  deleteModuleItem: (id: string) => moduleDb.deleteModuleItem(id),

  // Export snapshot (used by useParaData export)
  async getExportSnapshot(): Promise<{
    items: ParaItem[];
    history: HistoryLog[];
    accounts: FinanceAccount[];
    transactions: Transaction[];
  }> {
    const [items, history, accounts, transactions] = await Promise.all([
      paraDb.getAll(),
      paraDb.getLogs(),
      financeDb.getAccounts(),
      financeDb.getTransactions()
    ]);
    return { items, history, accounts, transactions };
  }
};
