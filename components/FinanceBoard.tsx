import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FinanceAccount, Transaction, FinanceAccountType, ParaItem, TransactionType } from '../types';
import {
  ArrowRightLeft, Banknote, Building2, Camera, CreditCard, Link2,
  PieChart, Plus, ReceiptText, Wallet
} from 'lucide-react';
import { generateId } from '../utils/helpers';
import { db } from '../services/db';
import { classifyFinanceDocumentWithAi, parseFinanceDocument } from '../services/financeIntakeService';
import {
  TransactionModal, AccountModal,
  TransactionDraft, AccountDraft,
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES
} from './finance/FinanceModals';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f87171', Transport: '#fb923c', Shopping: '#fbbf24', Utilities: '#a3e635',
  Housing: '#34d399', Health: '#22d3ee', Entertainment: '#818cf8', Education: '#c084fc',
  Travel: '#f472b6', Subscriptions: '#94a3b8', Salary: '#34d399', Freelance: '#22d3ee',
  Investment: '#818cf8', Gift: '#f472b6', Refund: '#fbbf24', General: '#64748b'
};
const getCategoryColor = (cat: string) => CATEGORY_COLORS[cat] || '#64748b';

const toLocalDateTimeValue = (iso: string) => {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const toIsoFromDateTimeLocal = (value: string) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const emptyTransactionDraft = (accountId = '', type: TransactionType = 'EXPENSE'): TransactionDraft => ({
  description: '', amount: '', type, category: 'General',
  accountId, projectId: '',
  transactionDate: toLocalDateTimeValue(new Date().toISOString()),
  receiptUrl: ''
});

const emptyAccountDraft = (): AccountDraft => ({
  name: '', type: 'BANK', balance: '0', currency: 'THB', isIncludeNetWorth: true
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface FinanceBoardProps {
  accounts: FinanceAccount[];
  transactions: Transaction[];
  projects: ParaItem[];
  onAddTransaction?: (tx: Transaction) => Promise<void>;
  onAddAccount?: (account: FinanceAccount) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FinanceBoard: React.FC<FinanceBoardProps> = ({
  accounts, transactions, projects, onAddTransaction, onAddAccount
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

  const netWorth = useMemo(
    () => accounts.filter((a) => a.isIncludeNetWorth).reduce((sum, a) => sum + a.balance, 0),
    [accounts]
  );
  const assets = accounts.filter((a) => a.balance > 0).reduce((sum, a) => sum + a.balance, 0);
  const liabilities = accounts.filter((a) => a.balance < 0).reduce((sum, a) => sum + a.balance, 0);

  const getAccountIcon = (type: FinanceAccountType) => {
    switch (type) {
      case 'BANK': return <Building2 className="w-5 h-5" />;
      case 'CREDIT': return <CreditCard className="w-5 h-5" />;
      case 'INVESTMENT': return <PieChart className="w-5 h-5" />;
      default: return <Wallet className="w-5 h-5" />;
    }
  };

  const projectMap = useMemo(
    () => projects.reduce((acc, p) => ({ ...acc, [p.id]: p.title }), {} as Record<string, string>),
    [projects]
  );

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
    if (!onAddTransaction) { setFinanceError('Finance action handlers are not connected.'); return; }

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
        const aiSuggestion = await classifyFinanceDocumentWithAi({ ocrText: parseResult.ocrText, qrRaw: parseResult.qrRaw, hint: suggestion });
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
      setTxDraft({
        description: suggestion.description || file.name,
        amount: suggestion.amount ? String(suggestion.amount) : '',
        type: suggestion.type || 'EXPENSE',
        category: suggestion.category || 'General',
        accountId: defaultAccountId,
        projectId: '',
        transactionDate: toLocalDateTimeValue(suggestion.transactionDate || new Date().toISOString()),
        receiptUrl: receiptUpload || ''
      });
      setParseInfo(`${needsAi ? 'QR/OCR + AI fallback' : parseResult.parseSource} • confidence ${Math.round(suggestion.confidence * 100)}%`);
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
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setFinanceError('Amount must be greater than 0.'); return; }
    if (!txDraft.accountId) { setFinanceError('Please select an account.'); return; }
    setIsSaving(true);
    try {
      const normalizedAmount = txDraft.type === 'EXPENSE' ? -Math.abs(parsedAmount)
        : txDraft.type === 'INCOME' ? Math.abs(parsedAmount) : parsedAmount;
      const description = txDraft.receiptUrl ? `${txDraft.description}\nReceipt: ${txDraft.receiptUrl}` : txDraft.description;
      await onAddTransaction({
        id: generateId(), description: description.trim(),
        amount: normalizedAmount, type: txDraft.type,
        category: txDraft.category || 'General',
        accountId: txDraft.accountId,
        projectId: txDraft.projectId || undefined,
        transactionDate: toIsoFromDateTimeLocal(txDraft.transactionDate)
      });
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
    if (!accountDraft.name.trim()) { setFinanceError('Account name is required.'); return; }
    setIsSaving(true);
    try {
      const balance = Number.parseFloat(accountDraft.balance || '0');
      await onAddAccount({
        id: generateId(), name: accountDraft.name.trim(),
        type: accountDraft.type,
        balance: Number.isFinite(balance) ? balance : 0,
        currency: accountDraft.currency.trim() || 'THB',
        isIncludeNetWorth: accountDraft.isIncludeNetWorth
      });
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
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadedSlip} />

      {/* ── Action Bar ── */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openTransactionModal('INCOME')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20">
            <Plus className="h-3.5 w-3.5" />Add Income
          </button>
          <button onClick={() => openTransactionModal('EXPENSE')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20">
            <Plus className="h-3.5 w-3.5" />Add Expense
          </button>
          <button onClick={() => { setFinanceError(null); setAccountDraft(emptyAccountDraft()); setIsAccountModalOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20">
            <Wallet className="h-3.5 w-3.5" />Add Account
          </button>
          <button onClick={handleUploadSlipClick} disabled={isParsingDoc}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            {isParsingDoc ? <ReceiptText className="h-3.5 w-3.5 animate-pulse" /> : <Camera className="h-3.5 w-3.5" />}
            {isParsingDoc ? 'Parsing Slip...' : 'Upload Receipt/Slip'}
          </button>
          <p className="ml-auto text-[11px] text-slate-400">Token saver: QR/OCR first, AI fallback only when confidence is low.</p>
        </div>
        {(financeError || parseInfo) && (
          <div className="mt-2 space-y-1">
            {parseInfo && <p className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] text-cyan-100">{parseInfo}</p>}
            {financeError && <p className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100">{financeError}</p>}
          </div>
        )}
      </div>

      {/* ── Net Worth ── */}
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

      {/* ── Accounts ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-cyan-300" /> Accounts
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 flex justify-between items-center hover:border-cyan-400/40 transition-colors">
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

      {/* ── Spending Donut ── */}
      {(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const expenseThisMonth = transactions.filter((tx) => tx.type === 'EXPENSE' && new Date(tx.transactionDate) >= monthStart);
        const totalExpense = expenseThisMonth.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const byCategory = expenseThisMonth.reduce((acc, tx) => {
          const cat = tx.category || 'General';
          acc[cat] = (acc[cat] || 0) + Math.abs(tx.amount);
          return acc;
        }, {} as Record<string, number>);
        const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return null;
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
              <div className="relative shrink-0">
                <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
                <div className="absolute inset-3 rounded-full bg-slate-900 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Total</p>
                    <p className="text-sm font-bold text-slate-100">฿{totalExpense.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {segments.map((s) => (
                  <div key={s.cat} className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-slate-300 truncate">{s.cat}</span>
                    <span className="text-[10px] text-slate-500 ml-auto shrink-0">{Math.round(s.pct)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Recent Transactions ── */}
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
                    const accountName = accounts.find((a) => a.id === tx.accountId)?.name || 'Unknown';
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
                                <Link2 className="w-3 h-3" />{projectMap[tx.projectId]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {effectiveAmount > 0 ? '+' : ''}{effectiveAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            tx.type === 'INCOME' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                            : tx.type === 'EXPENSE' ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
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

      {/* ── Modals ── */}
      {isTransactionModalOpen && (
        <TransactionModal
          txDraft={txDraft} setTxDraft={setTxDraft}
          accounts={accounts} projects={projects}
          isSaving={isSaving} financeError={financeError} parseInfo={parseInfo}
          onClose={() => setIsTransactionModalOpen(false)}
          onSave={() => void handleSaveTransaction()}
        />
      )}
      {isAccountModalOpen && (
        <AccountModal
          accountDraft={accountDraft} setAccountDraft={setAccountDraft}
          isSaving={isSaving} financeError={financeError}
          onClose={() => setIsAccountModalOpen(false)}
          onSave={() => void handleSaveAccount()}
        />
      )}
    </div>
  );
};
