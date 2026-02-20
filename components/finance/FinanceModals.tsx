// ─── Finance Board — Modal Components ─────────────────────────────────────────
// Transaction modal and Account modal extracted from FinanceBoard.

import React from 'react';
import { FinanceAccount, Transaction, FinanceAccountType, ParaItem, TransactionType } from '../../types';
import { Loader2, X } from 'lucide-react';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Utilities', 'Housing', 'Health',
  'Entertainment', 'Education', 'Travel', 'Subscriptions', 'General'
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Gift', 'Refund', 'General'
] as const;

export interface TransactionDraft {
  description: string;
  amount: string;
  type: TransactionType;
  category: string;
  accountId: string;
  projectId: string;
  transactionDate: string;
  receiptUrl: string;
}

export interface AccountDraft {
  name: string;
  type: FinanceAccountType;
  balance: string;
  currency: string;
  isIncludeNetWorth: boolean;
}

// ─── Transaction Modal ────────────────────────────────────────────────────────

interface TransactionModalProps {
  txDraft: TransactionDraft;
  setTxDraft: React.Dispatch<React.SetStateAction<TransactionDraft>>;
  accounts: FinanceAccount[];
  projects: ParaItem[];
  isSaving: boolean;
  financeError: string | null;
  parseInfo: string | null;
  onClose: () => void;
  onSave: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  txDraft, setTxDraft, accounts, projects, isSaving, financeError, parseInfo, onClose, onSave
}) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100">
          {txDraft.type === 'INCOME' ? 'Add Income' : txDraft.type === 'EXPENSE' ? 'Add Expense' : 'Add Transaction'}
        </h3>
        <button onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:text-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-slate-400">
          Description
          <input
            value={txDraft.description}
            onChange={(e) => setTxDraft((p) => ({ ...p, description: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        <label className="text-xs text-slate-400">
          Amount
          <input
            type="number" min="0" step="0.01"
            value={txDraft.amount}
            onChange={(e) => setTxDraft((p) => ({ ...p, amount: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        <label className="text-xs text-slate-400">
          Type
          <select
            value={txDraft.type}
            onChange={(e) => setTxDraft((p) => ({ ...p, type: e.target.value as TransactionType }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          >
            <option value="EXPENSE">EXPENSE</option>
            <option value="INCOME">INCOME</option>
            <option value="TRANSFER">TRANSFER</option>
          </select>
        </label>

        <label className="text-xs text-slate-400">
          Category
          <select
            value={(txDraft.type === 'EXPENSE' ? [...DEFAULT_EXPENSE_CATEGORIES] : [...DEFAULT_INCOME_CATEGORIES]).includes(txDraft.category as any) ? txDraft.category : '_custom'}
            onChange={(e) => {
              if (e.target.value === '_custom') setTxDraft((p) => ({ ...p, category: '' }));
              else setTxDraft((p) => ({ ...p, category: e.target.value }));
            }}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          >
            {(txDraft.type === 'EXPENSE' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="_custom">Other...</option>
          </select>
          {!(txDraft.type === 'EXPENSE' ? [...DEFAULT_EXPENSE_CATEGORIES] : [...DEFAULT_INCOME_CATEGORIES]).includes(txDraft.category as any) && (
            <input
              placeholder="Custom category"
              value={txDraft.category}
              onChange={(e) => setTxDraft((p) => ({ ...p, category: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
            />
          )}
        </label>

        <label className="text-xs text-slate-400">
          Account
          <select
            value={txDraft.accountId}
            onChange={(e) => setTxDraft((p) => ({ ...p, accountId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          >
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className="text-xs text-slate-400">
          Project (optional)
          <select
            value={txDraft.projectId}
            onChange={(e) => setTxDraft((p) => ({ ...p, projectId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          >
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>

        <label className="sm:col-span-2 text-xs text-slate-400">
          Transaction Date
          <input
            type="datetime-local"
            value={txDraft.transactionDate}
            onChange={(e) => setTxDraft((p) => ({ ...p, transactionDate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        {txDraft.receiptUrl && (
          <div className="sm:col-span-2 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Slip uploaded.{' '}
            <a href={txDraft.receiptUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Open proof</a>
          </div>
        )}
      </div>

      {parseInfo && (
        <p className="mt-3 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">{parseInfo}</p>
      )}
      {financeError && (
        <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{financeError}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Transaction'}
        </button>
      </div>
    </div>
  </div>
);

// ─── Account Modal ────────────────────────────────────────────────────────────

interface AccountModalProps {
  accountDraft: AccountDraft;
  setAccountDraft: React.Dispatch<React.SetStateAction<AccountDraft>>;
  isSaving: boolean;
  financeError: string | null;
  onClose: () => void;
  onSave: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  accountDraft, setAccountDraft, isSaving, financeError, onClose, onSave
}) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100">Add Account</h3>
        <button onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:text-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs text-slate-400">
          Account Name
          <input
            value={accountDraft.name}
            onChange={(e) => setAccountDraft((p) => ({ ...p, name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        <label className="text-xs text-slate-400">
          Type
          <select
            value={accountDraft.type}
            onChange={(e) => setAccountDraft((p) => ({ ...p, type: e.target.value as FinanceAccountType }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          >
            <option value="BANK">BANK</option>
            <option value="CASH">CASH</option>
            <option value="CREDIT">CREDIT</option>
            <option value="INVESTMENT">INVESTMENT</option>
          </select>
        </label>

        <label className="text-xs text-slate-400">
          Opening Balance
          <input
            type="number" step="0.01"
            value={accountDraft.balance}
            onChange={(e) => setAccountDraft((p) => ({ ...p, balance: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        <label className="text-xs text-slate-400">
          Currency
          <input
            value={accountDraft.currency}
            onChange={(e) => setAccountDraft((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-300 mt-5">
          <input
            type="checkbox"
            checked={accountDraft.isIncludeNetWorth}
            onChange={(e) => setAccountDraft((p) => ({ ...p, isIncludeNetWorth: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900"
          />
          Include in net worth
        </label>
      </div>

      {financeError && (
        <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{financeError}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Cancel</button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save Account'}
        </button>
      </div>
    </div>
  </div>
);
