import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, PencilLine, CalendarDays, Banknote, Bell,
  CheckCircle2, Clock, X, ExternalLink, CreditCard, Loader2
} from 'lucide-react';
import {
  Subscription, SubscriptionStatus, BillingCycle, SUBSCRIPTION_CATEGORIES
} from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const CYCLE_TO_MONTHLY: Record<BillingCycle, number> = {
  daily: 30,
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

const toMonthly = (amount: number, cycle: BillingCycle) =>
  amount * CYCLE_TO_MONTHLY[cycle];

const daysUntil = (dateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (amount: number, currency: string) => {
  const sym: Record<string, string> = { THB: '฿', USD: '$', EUR: '€', SGD: 'S$', JPY: '¥' };
  return `${sym[currency] ?? currency}${amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; cls: string }> = {
  active:              { label: 'Active',    cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  active_unsubscribed: { label: 'Ending',    cls: 'bg-amber-500/10  text-amber-300  border-amber-500/30'   },
  cancelled:           { label: 'Cancelled', cls: 'bg-slate-700     text-slate-400  border-slate-600'      },
};

const CYCLE_LABELS: Record<BillingCycle, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year'
};

const CURRENCIES = ['THB', 'USD', 'EUR', 'SGD', 'JPY'];

// ─── types ───────────────────────────────────────────────────────────────────

interface SubscriptionsBoardProps {
  subscriptions: Subscription[];
  onAdd: (sub: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate: (sub: Subscription) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading: boolean;
}

const EMPTY_DRAFT = {
  name: '',
  category: 'Other',
  billingAmount: 0,
  billingCycle: 'monthly' as BillingCycle,
  currency: 'THB',
  renewalDate: '',
  status: 'active' as SubscriptionStatus,
  autoRenew: true,
  reminderDays: 7,
  startDate: '',
  website: '',
  accountEmail: '',
  notes: '',
};

// ─── component ───────────────────────────────────────────────────────────────

export const SubscriptionsBoard: React.FC<SubscriptionsBoardProps> = ({
  subscriptions, onAdd, onUpdate, onDelete, isLoading
}) => {
  const [activeStatus, setActiveStatus] = useState<'all' | SubscriptionStatus>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [isSaving, setIsSaving] = useState(false);

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const living = subscriptions.filter(s => s.status !== 'cancelled');
    const totalMonthly = living.reduce(
      (sum, s) => sum + toMonthly(s.billingAmount, s.billingCycle), 0
    );
    const activeCount = subscriptions.filter(s => s.status === 'active').length;
    const expiringSoon = subscriptions.filter(s => {
      const d = daysUntil(s.renewalDate);
      return d >= 0 && d <= 7 && s.status !== 'cancelled';
    }).length;
    return { totalMonthly, activeCount, expiringSoon };
  }, [subscriptions]);

  // ── filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return subscriptions.filter(s => {
      if (activeStatus !== 'all' && s.status !== activeStatus) return false;
      if (activeCategory !== 'all' && s.category !== activeCategory) return false;
      return true;
    });
  }, [subscriptions, activeStatus, activeCategory]);

  // ── categories present in data ────────────────────────────────────────────
  const presentCategories = useMemo(() => {
    const cats = new Set(subscriptions.map(s => s.category));
    return Array.from(cats).sort();
  }, [subscriptions]);

  // ── modal helpers ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingSub(null);
    setDraft({ ...EMPTY_DRAFT });
    setIsModalOpen(true);
  };

  const openEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setDraft({
      name: sub.name,
      category: sub.category,
      billingAmount: sub.billingAmount,
      billingCycle: sub.billingCycle,
      currency: sub.currency,
      renewalDate: sub.renewalDate,
      status: sub.status,
      autoRenew: sub.autoRenew,
      reminderDays: sub.reminderDays,
      startDate: sub.startDate ?? '',
      website: sub.website ?? '',
      accountEmail: sub.accountEmail ?? '',
      notes: sub.notes ?? '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSub(null);
  };

  const set = (field: string, value: any) =>
    setDraft(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.renewalDate) return;
    setIsSaving(true);
    try {
      const costMonthly = toMonthly(draft.billingAmount, draft.billingCycle);
      const payload = {
        name: draft.name.trim(),
        category: draft.category,
        billingAmount: Number(draft.billingAmount),
        billingCycle: draft.billingCycle,
        costMonthly,
        currency: draft.currency,
        renewalDate: draft.renewalDate,
        status: draft.status,
        autoRenew: draft.autoRenew,
        reminderDays: Number(draft.reminderDays),
        startDate: draft.startDate || undefined,
        website: draft.website.trim() || undefined,
        accountEmail: draft.accountEmail.trim() || undefined,
        notes: draft.notes.trim() || undefined,
      };
      if (editingSub) {
        await onUpdate({ ...editingSub, ...payload });
      } else {
        await onAdd(payload);
      }
      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-violet-400" />
          <h2 className="text-xl font-semibold text-slate-100">Subscriptions</h2>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Subscription
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Banknote className="w-3.5 h-3.5" /> Total / month
          </div>
          <div className="text-2xl font-bold text-slate-100">
            ฿{stats.totalMonthly.toLocaleString('en', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats.activeCount}</div>
        </div>
        <div className={`border rounded-xl p-4 ${stats.expiringSoon > 0
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-slate-800/60 border-slate-700/50'}`}>
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Bell className="w-3.5 h-3.5" /> Renewing ≤7 days
          </div>
          <div className={`text-2xl font-bold ${stats.expiringSoon > 0 ? 'text-amber-300' : 'text-slate-100'}`}>
            {stats.expiringSoon}
          </div>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'active_unsubscribed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              activeStatus === s
                ? 'bg-violet-600 text-white border-violet-500'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
          </button>
        ))}
        {presentCategories.length > 0 && (
          <>
            <span className="text-slate-600 self-center">|</span>
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                activeCategory === 'all'
                  ? 'bg-slate-600 text-white border-slate-500'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'
              }`}
            >All Categories</button>
            {presentCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  activeCategory === cat
                    ? 'bg-slate-600 text-white border-slate-500'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'
                }`}
              >{cat}</button>
            ))}
          </>
        )}
      </div>

      {/* Subscription cards */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <CreditCard className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No subscriptions found</p>
          <p className="text-xs mt-1 opacity-70">Click "Add Subscription" to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(sub => {
            const days = daysUntil(sub.renewalDate);
            const isExpiringSoon = days >= 0 && days <= 7 && sub.status !== 'cancelled';
            const isOverdue = days < 0 && sub.status !== 'cancelled';
            return (
              <div
                key={sub.id}
                className={`relative bg-slate-800/50 border rounded-xl p-4 flex flex-col gap-3 transition-all hover:bg-slate-800/80 ${
                  isExpiringSoon ? 'border-amber-500/40' :
                  isOverdue ? 'border-red-500/40' :
                  sub.status === 'cancelled' ? 'border-slate-700/30 opacity-60' :
                  'border-slate-700/50'
                }`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">{sub.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{sub.category}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(sub)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(sub.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Cost */}
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-slate-100">
                    {fmtMoney(sub.billingAmount, sub.currency)}
                  </span>
                  <span className="text-xs text-slate-500">/ {CYCLE_LABELS[sub.billingCycle]}</span>
                  {sub.billingCycle !== 'monthly' && (
                    <span className="text-xs text-slate-600 ml-1">
                      (≈฿{toMonthly(sub.billingAmount, sub.billingCycle).toLocaleString('en', { maximumFractionDigits: 0 })}/mo)
                    </span>
                  )}
                </div>

                {/* Renewal */}
                <div className={`flex items-center gap-2 text-xs ${
                  isOverdue ? 'text-red-400' : isExpiringSoon ? 'text-amber-300' : 'text-slate-400'
                }`}>
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span>Renews {fmtDate(sub.renewalDate)}</span>
                  <span className={`px-1.5 py-0.5 rounded-md font-medium ${
                    isOverdue ? 'bg-red-500/15 text-red-300' :
                    isExpiringSoon ? 'bg-amber-500/15 text-amber-300' :
                    'bg-slate-700/60 text-slate-400'
                  }`}>
                    {isOverdue ? `${Math.abs(days)}d overdue` :
                     days === 0 ? 'Today' :
                     `${days}d`}
                  </span>
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-slate-700/30">
                  <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_CONFIG[sub.status].cls}`}>
                    {STATUS_CONFIG[sub.status].label}
                  </span>
                  <div className="flex items-center gap-2">
                    {sub.autoRenew && (
                      <span title="Auto-renew on">
                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                      </span>
                    )}
                    {sub.website && (
                      <a
                        href={sub.website.startsWith('http') ? sub.website : `https://${sub.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-violet-400 transition-colors"
                        title={sub.website}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-slate-100">
                {editingSub ? 'Edit Subscription' : 'Add Subscription'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto p-5 flex flex-col gap-4">

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Name *</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Netflix, Spotify, GitHub Pro..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Category</label>
                <select
                  value={draft.category}
                  onChange={e => set('category', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                >
                  {SUBSCRIPTION_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Billing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Billing amount *</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draft.billingAmount}
                    onChange={e => set('billingAmount', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Billing cycle</label>
                  <select
                    value={draft.billingCycle}
                    onChange={e => set('billingCycle', e.target.value as BillingCycle)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Currency + Renewal date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Currency</label>
                  <select
                    value={draft.currency}
                    onChange={e => set('currency', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Next renewal date *</label>
                  <input
                    type="date"
                    value={draft.renewalDate}
                    onChange={e => set('renewalDate', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Status + Auto renew */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
                  <select
                    value={draft.status}
                    onChange={e => set('status', e.target.value as SubscriptionStatus)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  >
                    <option value="active">Active</option>
                    <option value="active_unsubscribed">Active (unsubscribed — ending)</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Reminder (days before)</label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={draft.reminderDays}
                    onChange={e => set('reminderDays', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Auto renew checkbox */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.autoRenew}
                  onChange={e => set('autoRenew', e.target.checked)}
                  className="w-4 h-4 rounded accent-violet-500"
                />
                <span className="text-sm text-slate-300">Auto-renew enabled</span>
              </label>

              {/* Optional fields */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Start date (optional)</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Website (optional)</label>
                <input
                  type="text"
                  value={draft.website}
                  onChange={e => set('website', e.target.value)}
                  placeholder="e.g. netflix.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Account email (optional)</label>
                <input
                  type="email"
                  value={draft.accountEmail}
                  onChange={e => set('accountEmail', e.target.value)}
                  placeholder="e.g. you@gmail.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes (optional)</label>
                <textarea
                  value={draft.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={2}
                  placeholder="Any notes about this subscription..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-violet-500 resize-none"
                />
              </div>

              {/* Monthly cost preview */}
              {draft.billingAmount > 0 && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-4 py-2.5 text-sm text-violet-300">
                  ≈ <strong>฿{toMonthly(Number(draft.billingAmount), draft.billingCycle).toLocaleString('en', { maximumFractionDigits: 0 })}</strong> / month
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!draft.name.trim() || !draft.renewalDate || isSaving}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingSub ? 'Save changes' : 'Add subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
