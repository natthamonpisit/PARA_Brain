import { useState, useCallback, useEffect } from 'react';
import {
    ParaItem,
    ChatMessage,
    FinanceAccount,
    AppModule,
    ParaType,
    Transaction,
    ModuleItem,
    ChatCreatedItemType,
    TelegramLogPayloadV1
} from '../types';
import { analyzeLifeOS, performLifeAnalysis } from '../services/geminiService';
import { generateId } from '../utils/helpers';
import { HistoryLog } from '../types';
import { supabase } from '../services/supabase';

interface UseAIChatProps {
    items: ParaItem[];
    accounts: FinanceAccount[];
    modules: AppModule[];
    onAddItem: (item: ParaItem) => Promise<any>;
    onToggleComplete: (id: string, status: boolean) => Promise<any>;
    onAddTransaction: (tx: Transaction) => Promise<any>;
    onAddModuleItem: (item: ModuleItem) => Promise<any>;
    onRefreshFinance?: () => Promise<any>;
    onRefreshModuleItems?: (moduleId: string) => Promise<any>;
}

export const useAIChat = ({
    items,
    accounts,
    modules,
    onAddItem,
    onToggleComplete,
    onAddTransaction,
    onAddModuleItem,
    onRefreshFinance,
    onRefreshModuleItems
}: UseAIChatProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const upsertMessages = useCallback((incoming: ChatMessage[]) => {
        setMessages(prev => {
            const map = new Map<string, ChatMessage>();
            prev.forEach(msg => map.set(msg.id, msg));
            incoming.forEach(msg => {
                const existing = map.get(msg.id);
                map.set(msg.id, existing ? { ...existing, ...msg } : msg);
            });
            return Array.from(map.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        });
    }, []);

    const addMessage = useCallback((msg: ChatMessage) => {
        upsertMessages([msg]);
    }, [upsertMessages]);

    const toSafeDate = (value: any): Date => {
        const d = new Date(value || Date.now());
        return Number.isNaN(d.getTime()) ? new Date() : d;
    };

    const isItemType = (value: any): value is ChatCreatedItemType => {
        return value === 'PARA' || value === 'TRANSACTION' || value === 'MODULE';
    };

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

    const parseTelegramPayload = (value: any): {
        text: string;
        itemType?: ChatCreatedItemType;
        createdItem?: ParaItem | Transaction | ModuleItem;
        createdItems?: ParaItem[];
    } => {
        const raw = (() => {
            if (typeof value === 'string') return value.trim();
            if (value && typeof value === 'object') {
                try {
                    return JSON.stringify(value);
                } catch {
                    return '[payload]';
                }
            }
            return String(value || '').trim();
        })();
        if (!raw) return { text: '' };
        const parsed = toJsonPayload(value) as Partial<TelegramLogPayloadV1> | null;
        if (!parsed || typeof parsed !== 'object') {
            return { text: raw };
        }

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

    const callCaptureIntake = async (text: string): Promise<any> => {
        const response = await fetch('/api/capture-intake', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source: 'WEB',
                message: text
            })
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || `Capture API failed (${response.status})`);
        }
        return body;
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        addMessage({
            id: generateId(),
            role: 'user',
            text: text,
            source: 'WEB',
            timestamp: new Date()
        });

        setIsProcessing(true);

        try {
            const recentHistory = messages.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

            try {
                const apiResult = await callCaptureIntake(text);
                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: String(apiResult.chatResponse || 'รับทราบครับ'),
                    source: 'WEB',
                    itemType: apiResult.itemType as ChatCreatedItemType | undefined,
                    createdItem: apiResult.createdItem || undefined,
                    createdItems: Array.isArray(apiResult.createdItems) && apiResult.createdItems.length > 0
                        ? apiResult.createdItems
                        : undefined,
                    timestamp: new Date()
                });

                if (apiResult.itemType === 'TRANSACTION' && onRefreshFinance) {
                    await onRefreshFinance();
                }

                if (apiResult.itemType === 'MODULE' && onRefreshModuleItems) {
                    const moduleId = apiResult?.createdItem?.moduleId || apiResult?.createdItem?.module_id;
                    if (moduleId) {
                        await onRefreshModuleItems(String(moduleId));
                    }
                }
                return;
            } catch (captureError: any) {
                console.warn('Capture API unavailable, falling back to local analyzer:', captureError?.message || captureError);
            }
            
            const result = await analyzeLifeOS(text, {
                paraItems: items,
                financeContext: { accounts },
                modules: modules,
                recentContext: recentHistory
            });

            // --- BATCH CREATE LOGIC (ENHANCED) ---
            if (result.operation === 'BATCH_CREATE' && result.batchItems) {
                const createdItems: ParaItem[] = [];
                // Map tempId (from AI) to realId (UUID)
                const tempIdMap: Record<string, string> = {}; 

                // 1. First Pass: Create IDs for everyone so we can link them
                result.batchItems.forEach(item => {
                    if (item.tempId) {
                        tempIdMap[item.tempId] = generateId();
                    }
                });

                // 2. Second Pass: Create Items with correct links
                // We assume AI sorts parents before children, but just in case, logic handles it.
                for (const item of result.batchItems) {
                    const realId = item.tempId ? tempIdMap[item.tempId] : generateId();
                    const finalTitle = item.title || "New Item";

                    // Resolve Relations
                    let finalRelations: string[] = item.relatedItemIdsCandidates || [];
                    
                    // Link to parent created in THIS batch?
                    if (item.parentTempId && tempIdMap[item.parentTempId]) {
                        finalRelations.push(tempIdMap[item.parentTempId]);
                    }

                    const newItem: ParaItem = {
                        id: realId,
                        title: finalTitle,
                        content: item.summary || "",
                        type: item.type || ParaType.TASK,
                        category: item.category || "Inbox",
                        tags: item.suggestedTags || [],
                        relatedItemIds: finalRelations,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        isAiGenerated: true,
                        isCompleted: false
                    };

                    await onAddItem(newItem);
                    createdItems.push(newItem);
                }

                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    source: 'WEB',
                    createdItems: createdItems,
                    itemType: 'PARA',
                    timestamp: new Date()
                });

            } else if (result.operation === 'CREATE') {
                const finalTitle = result.title || (text.length > 30 ? text.substring(0, 30) + "..." : text);
                
                const newItem: ParaItem = {
                    id: generateId(),
                    title: finalTitle,
                    content: result.summary || text, 
                    type: result.type || ParaType.TASK,
                    category: result.category || "Inbox",
                    tags: result.suggestedTags || [],
                    relatedItemIds: result.relatedItemIdsCandidates || [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isAiGenerated: true,
                    isCompleted: false
                };

                await onAddItem(newItem);

                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    source: 'WEB',
                    createdItem: newItem,
                    itemType: 'PARA',
                    timestamp: new Date()
                });

            } else if (result.operation === 'CHAT') {
                addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', timestamp: new Date() });
            } else if (result.operation === 'COMPLETE') {
                addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', timestamp: new Date() });
            } else if (result.operation === 'TRANSACTION') {
                const txDesc = result.title || text;
                const newTx: Transaction = {
                    id: generateId(),
                    description: txDesc, 
                    amount: result.amount || 0,
                    type: result.transactionType || 'EXPENSE',
                    category: result.category || 'General',
                    accountId: result.accountId || (accounts[0] ? accounts[0].id : ''),
                    transactionDate: new Date().toISOString()
                };
                if (newTx.accountId) {
                    await onAddTransaction(newTx);
                    addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', createdItem: newTx, itemType: 'TRANSACTION', timestamp: new Date() });
                } else {
                     addMessage({ id: generateId(), role: 'assistant', text: "No valid account found.", source: 'WEB', timestamp: new Date() });
                }
            } else if (result.operation === 'MODULE_ITEM') {
                if (result.targetModuleId) {
                    const modData: Record<string, any> = {};
                    if (result.moduleDataRaw) {
                        result.moduleDataRaw.forEach(f => {
                             const numVal = Number(f.value);
                             modData[f.key] = isNaN(numVal) ? f.value : numVal;
                        });
                    }
                    const newItem: ModuleItem = {
                        id: generateId(), moduleId: result.targetModuleId, title: result.title || "New Entry", data: modData, tags: result.suggestedTags || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                    };
                    await onAddModuleItem(newItem);
                    addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', createdItem: newItem, itemType: 'MODULE', timestamp: new Date() });
                }
            } else {
                 addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', timestamp: new Date() });
            }

        } catch (error: any) {
            console.error("AI Error:", error);
            addMessage({ id: generateId(), role: 'assistant', text: `Error: ${error.message}`, source: 'WEB', timestamp: new Date() });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleChatCompletion = async (item: ParaItem) => {
        await onToggleComplete(item.id, !!item.isCompleted);
    };

    const analyzeLife = async (logs: HistoryLog[], transactions: Transaction[]) => {
        return await performLifeAnalysis(logs, transactions);
    };

    return {
        messages,
        isProcessing,
        handleSendMessage,
        handleChatCompletion,
        analyzeLife
    };
};
