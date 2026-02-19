import { useState, useCallback } from 'react';
import { Subscription } from '../types';
import { db } from '../services/db';
import { generateId } from '../utils/helpers';

export const useSubscriptionsData = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);

  const loadSubscriptions = useCallback(async () => {
    setIsLoadingSubscriptions(true);
    try {
      const subs = await db.getSubscriptions();
      setSubscriptions(subs);
    } catch (e) {
      console.error('Failed to load subscriptions', e);
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }, []);

  const addSubscription = async (
    sub: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> => {
    const now = new Date().toISOString();
    const full: Subscription = {
      ...sub,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    await db.addSubscription(full);
    await loadSubscriptions();
  };

  const updateSubscription = async (sub: Subscription): Promise<void> => {
    await db.updateSubscription(sub);
    await loadSubscriptions();
  };

  const deleteSubscription = async (id: string): Promise<void> => {
    await db.deleteSubscription(id);
    setSubscriptions(prev => prev.filter(s => s.id !== id));
  };

  return {
    subscriptions,
    isLoadingSubscriptions,
    loadSubscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
  };
};
