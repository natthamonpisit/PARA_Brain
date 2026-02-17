import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FinanceAccount, Transaction, FinanceAccountType, ParaItem, TransactionType } from '../types';
import {
  ArrowRightLeft,
  Banknote,
  Building2,
  Camera,
  CreditCard,
  Link2,
  PieChart,
  Plus,
  ReceiptText,
  Wallet,
  X
} from 'lucide-react';
import { generateId } from '../utils/helpers';
import { db } from '../services/db';
import { classifyFinanceDocumentWithAi, parseFinanceDocument } from '../services/financeIntakeService';

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Utilities', 'Housing', 'Health',
  'Entertainment', 'Education', 'Travel', 'Subscriptions', 'General'
] as const;

const DEFAULT_INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Gift', 'Refund', 'General'
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f87171', Transport: '#fb923c', Shopping: '#fbbf24', Utilities: '#a3e635',
  Housing: '#34d399', Health: '#22d3ee', Entertainment: '#818cf8', Education: '#c084fc',
  Travel: '#f472b6', Subscriptions: '#94a3b8', Salary: '#34d399', Freelance: '#22d3ee',
  Investment: '#818cf8', Gift: '#f472b6', Refund: '#fbbf24', General: '#64748b'
};

const getCategoryColor = (cat: string) => CATEGORY_COLORS[cat] || '#64748b';

interface FinanceBoardProps {
  accounts: FinanceAccount[];
  transactions: Transaction[];
  projects: ParaItem[];
  onAddTransaction?: (tx: Transaction) => Promise<void>;
  onAddAccount?: (account: FinanceAccount) => Promise<void>;
}

interface TransactionDraft {
  description: string;
  amount: string;
  type: TransactionType;
  category: string;
  accountId: string;
  projectId: string;
  transactionDate: string;
  receiptUrl: string;
}

interface AccountDraft {
  name: string;
  type: FinanceAccountType;
  balance: string;
  currency: string;
  isIncludeNetWorth: boolean;
}

const toLocalDateTimeValue = (iso: string) => {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
};

const toIsoFromDateTimeLocal = (value: string) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const emptyTransactionDraft = (accountId = '', type: TransactionType = 'EXPENSE'): TransactionDraft => ({
  description: '',
  amount: '',
  type,
  category: 'General',
  accountId,
  projectId: '',
  transactionDate: toLocalDateTimeValue(new Date().toISOString()),
  receiptUrl: ''
});

const emptyAccountDraft = (): AccountDraft => ({
  name: '',
  type: 'BANK',
  balance: '0',
  currency: 'THB',
  isIncludeNetWorth: true
});

export const FinanceBoard: React.FC<FinanceBoardProps> = ({
  accounts,
  transactions,
  projects,
  onAddTransaction,
  onAddAccount
}) => {
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [txDraft, setTxDraft] = useState<TransactionDraft>(() => emptyTransactionDraft());
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(() => emptyAccountDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultAccountId = accounts[0]?.id || '';

  useEffect(() => {
    setTxDraft((prev) => {
      if (prev.accountId) return prev;
      return { ...prev, accountId: defaultAccountId };
    });
  }, [defaultAccountId]);

  const netWorth = useMemo(() => {
    return accounts
      .filter((account) => account.isIncludeNetWorth)
      .reduce((sum, account) => sum + account.balance, 0);
  }, [accounts]);

  const assets = accounts.filter((account) => account.balance > 0).reduce((sum, account) => sum + account.balance, 0);
  const liabilities = accounts.filter((account) => account.balance < 0).reduce((sum, account) => sum + account.balance, 0);

  const getAccountIcon = (type: FinanceAccountType) => {
    switch (type) {
      case 'BANK':
        return <Building2 className="w-5 h-5" />;
      case 'CREDIT':
        return <CreditCard className="w-5 h-5" />;
      case 'INVESTMENT':
        return <PieChart className="w-5 h-5" />;
      default:
        return <Wallet className="w-5 h-5" />;
    }
  };

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => ({ ...acc, [project.id]: project.title }), {} as Record<string, string>);
  }, [projects]);

  const openTransactionModal = (type: TransactionType) => {
    setFinanceError(null);
    setParseInfo(null);
    setTxDraft(emptyTransactionDraft(defaultAccountId, type));
    setIsTransactionModalOpen(true);
  };

  const handleUploadSlipClick = () => {
    setFinanceError(null);
    setParseInfo(null);
    fileInputRef.current?.click();
  };

  const handleUploadedSlip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (!onAddTransaction) {
      setFinanceError('Finance action handlers are not connected.');
      return;
    }

    setIsParsingDoc(true);
    setFinanceError(null);
    setParseInfo(null);

    try {
      const [parseResult, receiptUpload] = await Promise.all([
        parseFinanceDocument(file),
        db.uploadFile(file).catch(() => '')
      ]);

      let suggestion = parseResult.suggestion;
      const needsAi = !suggestion.amount || suggestion.confidence < 0.68;

      if (needsAi) {
        const aiSuggestion = await classifyFinanceDocumentWithAi({
          ocrText: parseResult.ocrText,
          qrRaw: parseResult.qrRaw,
          hint: suggestion
        });
        if (aiSuggestion) {
          suggestion = {
            description: aiSuggestion.description || suggestion.description,
            amount: aiSuggestion.amount ?? suggestion.amount,
            type: aiSuggestion.type || suggestion.type,
            category: aiSuggestion.category || suggestion.category,
            transactionDate: aiSuggestion.transactionDate || suggestion.transactionDate,
            confidence: Math.max(suggestion.confidence, aiSuggestion.confidence)
          };
        }
      }

      const amountValue = suggestion.amount ? String(suggestion.amount) : '';
      setTxDraft({
        description: suggestion.description || file.name,
        amount: amountValue,
        type: suggestion.type || 'EXPENSE',
        category: suggestion.category || 'General',
        accountId: defaultAccountId,
        projectId: '',
        transactionDate: toLocalDateTimeValue(suggestion.transactionDate || new Date().toISOString()),
        receiptUrl: receiptUpload || ''
      });

      const sourceLabel = needsAi ? 'QR/OCR + AI fallback' : parseResult.parseSource;
      setParseInfo(`${sourceLabel} • confidence ${Math.round(suggestion.confidence * 100)}%`);
      setIsTransactionModalOpen(true);
    } catch (error: any) {
      setFinanceError(error?.message || 'Failed to parse receipt/slip.');
    } finally {
      setIsParsingDoc(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!onAddTransaction) return;
    setFinanceError(null);

    const parsedAmount = Number.parseFloat(txDraft.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFinanceError('Amount must be greater than 0.');
      return;
    }
    if (!txDraft.accountId) {
      setFinanceError('Please select an account.');
      return;
    }

    setIsSaving(true);
    try {
      const normalizedAmount =
        txDraft.type === 'EXPENSE'
          ? -Math.abs(parsedAmount)
          : txDraft.type === 'INCOME'
            ? Math.abs(parsedAmount)
            : parsedAmount;

      const description = txDraft.receiptUrl
        ? `${txDraft.description}\nReceipt: ${txDraft.receiptUrl}`
        : txDraft.description;

      const nextTx: Transaction = {
        id: generateId(),
        description: description.trim(),
        amount: normalizedAmount,
        type: txDraft.type,
        category: txDraft.category || 'General',
        accountId: txDraft.accountId,
        projectId: txDraft.projectId || undefined,
        transactionDate: toIsoFromDateTimeLocal(txDraft.transactionDate)
      };

      await onAddTransaction(nextTx);
      setIsTransactionModalOpen(false);
      setTxDraft(emptyTransactionDraft(defaultAccountId));
      setParseInfo(null);
    } catch (error: any) {
      setFinanceError(error?.message || 'Failed to save transaction.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!onAddAccount) return;
    setFinanceError(null);

    if (!accountDraft.name.trim()) {
      setFinanceError('Account name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const balance = Number.parseFloat(accountDraft.balance || '0');
      const nextAccount: FinanceAccount = {
        id: generateId(),
        name: accountDraft.name.trim(),
        type: accountDraft.type,
        balance: Number.isFinite(balance) ? balance : 0,
        currency: accountDraft.currency.trim() || 'THB',
        isIncludeNetWorth: accountDraft.isIncludeNetWorth
      };
      await onAddAccount(nextAccount);
      setIsAccountModalOpen(false);
      setAccountDraft(emptyAccountDraft());
    } catch (error: any) {
      setFinanceError(error?.message || 'Failed to create account.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pb-32 space-y-6 animate-in fade-in duration-500">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadedSlip}
      />

      {/* Action Bar */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openTransactionModal('INCOME')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Income
          </button>
          <button
            onClick={() => openTransactionModal('EXPENSE')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Expense
          </button>
          <button
            onClick={() => {
              setFinanceError(null);
              setAccountDraft(emptyAccountDraft());
              setIsAccountModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20"
          >
            <Wallet className="h-3.5 w-3.5" />
            Add Account
          </button>
          <button
            onClick={handleUploadSlipClick}
            disabled={isParsingDoc}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isParsingDoc ? <ReceiptText className="h-3.5 w-3.5 animate-pulse" /> : <Camera className="h-3.5 w-3.5" />}
            {isParsingDoc ? 'Parsing Slip...' : 'Upload Receipt/Slip'}
          </button>
          <p className="ml-auto text-[11px] text-slate-400">
            Token saver: QR/OCR first, AI fallback only when confidence is low.
          </p>
        </div>
        {(financeError || parseInfo) && (
          <div className="mt-2 space-y-1">
            {parseInfo && (
              <p className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-100">
                {parseInfo}
              </p>
            )}
            {financeError && (
              <p className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100">
                {financeError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Net Worth Header */}
      <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-900 to-slate-800 p-5 md:p-6 text-white shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-400 text-xs md:text-sm font-medium uppercase tracking-wider">Net Worth</p>
            <h1 className="text-3xl md:text-4xl font-bold mt-1">฿ {netWorth.toLocaleString()}</h1>
          </div>
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
            <Banknote className="w-6 h-6 text-emerald-400" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/10 pt-4">
          <div>
            <p className="text-slate-400 text-xs mb-1">Total Assets</p>
            <p className="text-lg font-semibold text-emerald-400">฿ {assets.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Total Liabilities</p>
            <p className="text-lg font-semibold text-red-400">฿ {Math.abs(liabilities).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Accounts */}
      <div>
        <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-cyan-300" /> Accounts
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 flex justify-between items-center hover:border-cyan-400/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${account.balance >= 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-rose-500/10 text-rose-300'}`}>
                  {getAccountIcon(account.type)}
                </div>
                <div>
                  <p className="font-semibold text-slate-100 text-sm">{account.name}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{account.type}</p>
                </div>
              </div>
              <span className={`font-bold ${account.balance < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                {account.balance.toLocaleString()}
              </span>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-full text-center py-8 text-slate-400 bg-slate-900/50 rounded-2xl border border-dashed border-slate-700">
              No accounts yet. Add one to get started.
            </div>
          )}
        </div>
      </div>

      {/* Spending Breakdown Donut */}
      {(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const expenseThisMonth = transactions.filter(
          (tx) => tx.type === 'EXPENSE' && new Date(tx.transactionDate) >= monthStart
        );
        const totalExpense = expenseThisMonth.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const byCategory = expenseThisMonth.reduce((acc, tx) => {
          const cat = tx.category || 'General';
          acc[cat] = (acc[cat] || 0) + Math.abs(tx.amount);
          return acc;
        }, {} as Record<string, number>);
        const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) return null;

        // Build conic-gradient segments
        let cumPct = 0;
        const segments = sorted.map(([cat, amount]) => {
          const pct = (amount / totalExpense) * 100;
          const start = cumPct;
          cumPct += pct;
          return { cat, amount, pct, start, end: cumPct, color: getCategoryColor(cat) };
        });
        const gradient = segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ');

        return (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-4">
            <h2 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-cyan-300" /> Spending Breakdown
              <span className="text-[10px] text-slate-500 font-normal ml-auto">
                {now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </span>
            </h2>
            <div className="flex items-center gap-5">
              {/* Donut */}
              <div className="relative shrink-0">
                <div
                  className="w-28 h-28 rounded-full"
                  style={{ background: `conic-gradient(${gradient})` }}
                />
                <div className="absolute inset-3 rounded-full bg-slate-900 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Total</p>
                    <p className="text-sm font-bold text-slate-100">฿{totalExpense.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              {/* Legend */}
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {segments.map((s) => (
                  <div key={s.cat} className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-slate-300 truncate">{s.cat}</span>
                    <span className="text-[10px] text-slate-500 ml-auto shrink-0">
                      {Math.round(s.pct)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recent Transactions */}
      <div>
        <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-cyan-300" /> Recent Activity
        </h2>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No transactions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm text-left">
                <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 hidden md:table-cell">Type</th>
                    <th className="px-4 py-3 hidden md:table-cell">Account</th>
                    <th className="px-4 py-3 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {transactions.map((tx) => {
                    const accountName = accounts.find((account) => account.id === tx.accountId)?.name || 'Unknown';
                    const effectiveAmount = tx.type === 'EXPENSE' ? -Math.abs(tx.amount) : tx.type === 'INCOME' ? Math.abs(tx.amount) : tx.amount;
                    const isCredit = effectiveAmount >= 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100 whitespace-pre-line line-clamp-2">{tx.description}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 px-1.5 rounded">{tx.category}</span>
                            {tx.projectId && projectMap[tx.projectId] && (
                              <span className="flex items-center gap-1 text-[10px] text-cyan-300 border border-cyan-400/30 bg-cyan-500/10 px-1.5 rounded-full">
                                <Link2 className="w-3 h-3" />
                                {projectMap[tx.projectId]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {effectiveAmount > 0 ? '+' : ''}{effectiveAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            tx.type === 'INCOME'
                              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                              : tx.type === 'EXPENSE'
                                ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
                                : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{accountName}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {new Date(tx.transactionDate).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setIsTransactionModalOpen(false)} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                {txDraft.type === 'INCOME' ? 'Add Income' : txDraft.type === 'EXPENSE' ? 'Add Expense' : 'Add Transaction'}
              </h3>
              <button
                onClick={() => setIsTransactionModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs text-slate-400">
                Description
                <input
                  value={txDraft.description}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              <label className="text-xs text-slate-400">
                Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={txDraft.amount}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, amount: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              <label className="text-xs text-slate-400">
                Type
                <select
                  value={txDraft.type}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, type: event.target.value as TransactionType }))}
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
                  value={
                    (txDraft.type === 'EXPENSE'
                      ? [...DEFAULT_EXPENSE_CATEGORIES]
                      : [...DEFAULT_INCOME_CATEGORIES]
                    ).includes(txDraft.category as any)
                      ? txDraft.category
                      : '_custom'
                  }
                  onChange={(event) => {
                    if (event.target.value === '_custom') {
                      setTxDraft((prev) => ({ ...prev, category: '' }));
                    } else {
                      setTxDraft((prev) => ({ ...prev, category: event.target.value }));
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                >
                  {(txDraft.type === 'EXPENSE' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="_custom">Other...</option>
                </select>
                {!(txDraft.type === 'EXPENSE'
                  ? [...DEFAULT_EXPENSE_CATEGORIES]
                  : [...DEFAULT_INCOME_CATEGORIES]
                ).includes(txDraft.category as any) && (
                  <input
                    placeholder="Custom category"
                    value={txDraft.category}
                    onChange={(event) => setTxDraft((prev) => ({ ...prev, category: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                  />
                )}
              </label>

              <label className="text-xs text-slate-400">
                Account
                <select
                  value={txDraft.accountId}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, accountId: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-slate-400">
                Project (optional)
                <select
                  value={txDraft.projectId}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, projectId: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                >
                  <option value="">None</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-2 text-xs text-slate-400">
                Transaction Date
                <input
                  type="datetime-local"
                  value={txDraft.transactionDate}
                  onChange={(event) => setTxDraft((prev) => ({ ...prev, transactionDate: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              {txDraft.receiptUrl && (
                <div className="sm:col-span-2 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                  Slip uploaded.{' '}
                  <a href={txDraft.receiptUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Open proof
                  </a>
                </div>
              )}
            </div>

            {financeError && (
              <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {financeError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsTransactionModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveTransaction()}
                disabled={isSaving || !onAddTransaction}
                className="rounded-lg border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={() => setIsAccountModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Add Account</h3>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs text-slate-400">
                Account Name
                <input
                  value={accountDraft.name}
                  onChange={(event) => setAccountDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              <label className="text-xs text-slate-400">
                Type
                <select
                  value={accountDraft.type}
                  onChange={(event) => setAccountDraft((prev) => ({ ...prev, type: event.target.value as FinanceAccountType }))}
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
                  type="number"
                  step="0.01"
                  value={accountDraft.balance}
                  onChange={(event) => setAccountDraft((prev) => ({ ...prev, balance: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              <label className="text-xs text-slate-400">
                Currency
                <input
                  value={accountDraft.currency}
                  onChange={(event) => setAccountDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/45"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 mt-5">
                <input
                  type="checkbox"
                  checked={accountDraft.isIncludeNetWorth}
                  onChange={(event) => setAccountDraft((prev) => ({ ...prev, isIncludeNetWorth: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                Include in net worth
              </label>
            </div>

            {financeError && (
              <p className="mt-3 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {financeError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveAccount()}
                disabled={isSaving || !onAddAccount}
                className="rounded-lg border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
