// ─── subscriptionsDb ──────────────────────────────────────────────────────────
// Subscription CRUD — snake_case ↔ camelCase mapping included.

import { Subscription, BillingCycle, SubscriptionStatus } from '../../types';
import { supabase } from '../supabase';

export const subscriptionsDb = {
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
      updatedAt: row.updated_at
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
      linked_account_id: sub.linkedAccountId ?? null
    });
    if (error) throw new Error(error.message);
  },

  async updateSubscription(sub: Subscription): Promise<void> {
    const { error } = await supabase
      .from('subscriptions')
      .update({
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
        updated_at: new Date().toISOString()
      })
      .eq('id', sub.id);
    if (error) throw new Error(error.message);
  },

  async deleteSubscription(id: string): Promise<void> {
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
};
