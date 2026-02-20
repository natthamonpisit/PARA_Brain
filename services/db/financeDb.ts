// ─── financeDb ────────────────────────────────────────────────────────────────
// Finance accounts, transactions, and daily summaries.

import {
  FinanceAccount, FinanceAccountType,
  Transaction, TransactionType,
  DailySummary
} from '../../types';
import { supabase } from '../supabase';

export const financeDb = {
  // ── Accounts ───────────────────────────────────────────────────────────────

  async getAccounts(): Promise<FinanceAccount[]> {
    const { data, error } = await supabase.from('accounts').select('*').order('name');
    if (error) return [];
    return data.map((row: any): FinanceAccount => ({
      id: row.id,
      name: row.name,
      type: row.type as FinanceAccountType,
      balance: row.balance,
      currency: row.currency,
      isIncludeNetWorth: row.is_include_net_worth
    }));
  },

  async addAccount(account: FinanceAccount): Promise<void> {
    const { error } = await supabase.from('accounts').upsert({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      is_include_net_worth: account.isIncludeNetWorth
    });
    if (error) throw new Error(error.message);
  },

  async bulkAddAccounts(accounts: FinanceAccount[]): Promise<void> {
    if (accounts.length === 0) return;
    const { error } = await supabase.from('accounts').upsert(
      accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
        is_include_net_worth: a.isIncludeNetWorth
      }))
    );
    if (error) throw new Error(error.message);
  },

  // ── Transactions ───────────────────────────────────────────────────────────

  async getTransactions(limit?: number): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (typeof limit === 'number') query = query.limit(limit);
    const { data, error } = await query;
    if (error) return [];
    return data.map((row: any): Transaction => ({
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
    const { error } = await supabase.from('transactions').insert({
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      account_id: tx.accountId,
      project_id: tx.projectId,
      transaction_date: tx.transactionDate
    });
    if (error) throw new Error(error.message);
  },

  async bulkAddTransactions(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) return;
    const { error } = await supabase.from('transactions').insert(
      transactions.map(tx => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        account_id: tx.accountId,
        project_id: tx.projectId,
        transaction_date: tx.transactionDate
      }))
    );
    if (error) throw new Error(error.message);
  },

  // ── Daily summaries ────────────────────────────────────────────────────────

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
      .maybeSingle();
    if (error) return null;
    return data as DailySummary;
  },

  async addDailySummary(summary: DailySummary): Promise<void> {
    const { error } = await supabase.from('daily_summaries').upsert(summary);
    if (error) throw new Error(error.message);
  }
};
