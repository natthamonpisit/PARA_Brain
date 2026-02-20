// ─── useTelegramSync ──────────────────────────────────────────────────────────
// Loads recent Telegram messages from system_logs and subscribes to realtime
// updates. Returns upsertMessages so useAIChat can merge them into its state.

import { useEffect, useCallback } from 'react';
import { ChatMessage, ChatCreatedItemType, TelegramLogPayloadV1, ParaItem, Transaction, ModuleItem } from '../types';
import { supabase } from '../services/supabase';

// ─── helpers ──────────────────────────────────────────────────────────────────

const toSafeDate = (value: any): Date => {
  const d = new Date(value || Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const isItemType = (value: any): value is ChatCreatedItemType =>
  value === 'PARA' || value === 'TRANSACTION' || value === 'MODULE';

const toJsonPayload = (value: any): any | null => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || !raw.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
      return JSON.parse(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
};

const normalizeCreatedItem = (
  value: any,
  itemType?: ChatCreatedItemType
): ParaItem | Transaction | ModuleItem | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, any>;

  if (itemType === 'TRANSACTION') {
    return {
      ...raw,
      accountId: raw.accountId || raw.account_id || '',
      transactionDate: raw.transactionDate || raw.transaction_date || raw.created_at || new Date().toISOString()
    } as Transaction;
  }

  if (itemType === 'MODULE') {
    return {
      ...raw,
      moduleId: raw.moduleId || raw.module_id || '',
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString()
    } as ModuleItem;
  }

  return {
    ...raw,
    isCompleted: raw.isCompleted ?? raw.is_completed ?? false,
    relatedItemIds: raw.relatedItemIds || raw.related_item_ids || [],
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
    dueDate: raw.dueDate || raw.due_date
  } as ParaItem;
};

export const parseTelegramPayload = (value: any): {
  text: string;
  itemType?: ChatCreatedItemType;
  createdItem?: ParaItem | Transaction | ModuleItem;
  createdItems?: ParaItem[];
} => {
  const raw = (() => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return '[payload]'; }
    }
    return String(value || '').trim();
  })();
  if (!raw) return { text: '' };

  const parsed = toJsonPayload(value) as Partial<TelegramLogPayloadV1> | null;
  if (!parsed || typeof parsed !== 'object') return { text: raw };

  const looksLikePayload =
    parsed.contract === 'telegram_chat_v1' ||
    (typeof parsed.chatResponse === 'string' && typeof parsed.operation === 'string');
  if (!looksLikePayload) return { text: raw };

  const text = typeof parsed.chatResponse === 'string' && parsed.chatResponse.trim()
    ? parsed.chatResponse
    : raw;
  const itemType = isItemType(parsed.itemType) ? parsed.itemType : undefined;
  const createdItem = normalizeCreatedItem(parsed.createdItem, itemType);
  const createdItems = Array.isArray(parsed.createdItems)
    ? parsed.createdItems
        .map((item) => normalizeCreatedItem(item, 'PARA'))
        .filter(Boolean) as ParaItem[]
    : undefined;
  return { text, itemType, createdItem, createdItems };
};

// ─── hook ──────────────────────────────────────────────────────────────────────

export function useTelegramSync(
  upsertMessages: (incoming: ChatMessage[]) => void
) {
  const mapTelegramLogToMessages = useCallback((row: any): ChatMessage[] => {
    if (!row?.id) return [];
    const timestamp = toSafeDate(row.created_at);
    const incoming: ChatMessage[] = [];

    if (row.user_message) {
      incoming.push({
        id: `sys:${row.id}:user`,
        role: 'user',
        source: 'TELEGRAM',
        text: String(row.user_message),
        timestamp
      });
    }

    if (row.ai_response) {
      const parsed = parseTelegramPayload(row.ai_response);
      incoming.push({
        id: `sys:${row.id}:assistant`,
        role: 'assistant',
        source: 'TELEGRAM',
        text: parsed.text || String(row.ai_response),
        itemType: parsed.itemType,
        createdItem: parsed.createdItem,
        createdItems: parsed.createdItems,
        timestamp
      });
    }

    return incoming;
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRecentTelegramMessages = async () => {
      const { data, error } = await supabase
        .from('system_logs')
        .select('id,user_message,ai_response,created_at,event_source')
        .eq('event_source', 'TELEGRAM')
        .order('created_at', { ascending: true })
        .limit(80);

      if (!mounted || error || !data) return;
      const incoming = data.flatMap(mapTelegramLogToMessages);
      if (incoming.length > 0) upsertMessages(incoming);
    };

    loadRecentTelegramMessages();

    const channel = supabase
      .channel('chat-telegram-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_logs',
          filter: 'event_source=eq.TELEGRAM'
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;
          const incoming = mapTelegramLogToMessages(row);
          if (incoming.length > 0) upsertMessages(incoming);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [mapTelegramLogToMessages, upsertMessages]);
}
