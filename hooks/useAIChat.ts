import { useState, useCallback } from 'react';
import {
    ParaItem,
    ChatMessage,
    FinanceAccount,
    AppModule,
    ParaType,
    Transaction,
    ModuleItem,
    ChatCreatedItemType,
    HistoryLog
} from '../types';
import { analyzeLifeOS, performLifeAnalysis } from '../services/geminiService';
import { generateId } from '../utils/helpers';
import { useTelegramSync } from './useTelegramSync';
import { callCaptureIntake, callCaptureImageIntake } from './useCaptureAPI';

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

    // ── Telegram realtime sync ─────────────────────────────────────────────
    useTelegramSync(upsertMessages);

    // ── Send text message ──────────────────────────────────────────────────
    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        addMessage({
            id: generateId(),
            role: 'user',
            text,
            source: 'WEB',
            timestamp: new Date()
        });

        setIsProcessing(true);

        try {
            const recentHistory = messages.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

            // ── Try capture API first ──────────────────────────────────────
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
                    if (moduleId) await onRefreshModuleItems(String(moduleId));
                }
                return;
            } catch (captureError: any) {
                console.warn('Capture API unavailable, falling back to local analyzer:', captureError?.message || captureError);
            }

            // ── Local Gemini fallback ──────────────────────────────────────
            const result = await analyzeLifeOS(text, {
                paraItems: items,
                financeContext: { accounts },
                modules,
                recentContext: recentHistory
            });

            if (result.operation === 'BATCH_CREATE' && result.batchItems) {
                const createdItems: ParaItem[] = [];
                const tempIdMap: Record<string, string> = {};

                result.batchItems.forEach(item => {
                    if (item.tempId) tempIdMap[item.tempId] = generateId();
                });

                for (const item of result.batchItems) {
                    const realId = item.tempId ? tempIdMap[item.tempId] : generateId();
                    let finalRelations: string[] = item.relatedItemIdsCandidates || [];
                    if (item.parentTempId && tempIdMap[item.parentTempId]) {
                        finalRelations.push(tempIdMap[item.parentTempId]);
                    }
                    const newItem: ParaItem = {
                        id: realId,
                        title: item.title || 'New Item',
                        content: item.summary || '',
                        type: item.type || ParaType.TASK,
                        category: item.category || 'Inbox',
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
                    createdItems,
                    itemType: 'PARA',
                    timestamp: new Date()
                });

            } else if (result.operation === 'CREATE') {
                const finalTitle = result.title || (text.length > 30 ? text.substring(0, 30) + '...' : text);
                const newItem: ParaItem = {
                    id: generateId(),
                    title: finalTitle,
                    content: result.summary || text,
                    type: result.type || ParaType.TASK,
                    category: result.category || 'Inbox',
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

            } else if (result.operation === 'TRANSACTION') {
                const newTx: Transaction = {
                    id: generateId(),
                    description: result.title || text,
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
                    addMessage({ id: generateId(), role: 'assistant', text: 'No valid account found.', source: 'WEB', timestamp: new Date() });
                }

            } else if (result.operation === 'MODULE_ITEM' && result.targetModuleId) {
                const modData: Record<string, any> = {};
                if (result.moduleDataRaw) {
                    result.moduleDataRaw.forEach(f => {
                        const numVal = Number(f.value);
                        modData[f.key] = isNaN(numVal) ? f.value : numVal;
                    });
                }
                const newItem: ModuleItem = {
                    id: generateId(),
                    moduleId: result.targetModuleId,
                    title: result.title || 'New Entry',
                    data: modData,
                    tags: result.suggestedTags || [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await onAddModuleItem(newItem);
                addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', createdItem: newItem, itemType: 'MODULE', timestamp: new Date() });

            } else {
                // CHAT / COMPLETE / unknown
                addMessage({ id: generateId(), role: 'assistant', text: result.chatResponse, source: 'WEB', timestamp: new Date() });
            }

        } catch (error: any) {
            console.error('AI Error:', error);
            const msg = String(error?.message || '');
            const userFriendly = msg.includes('API Key not found') || msg.includes('Missing server configuration')
                ? 'Capture failed: API Key ไม่พบ — กรุณาตั้งค่า GEMINI_API_KEY ใน environment variables ของ Vercel'
                : `Error: ${msg}`;
            addMessage({ id: generateId(), role: 'assistant', text: userFriendly, source: 'WEB', timestamp: new Date() });
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Send image ─────────────────────────────────────────────────────────
    const handleSendImage = async (file: File, caption = '') => {
        if (!file) return;
        const safeCaption = String(caption || '').trim();
        const userText = safeCaption
            ? `[Image] ${safeCaption}`
            : `[Image] Uploaded image: ${file.name || 'image'}`;

        addMessage({ id: generateId(), role: 'user', text: userText, source: 'WEB', timestamp: new Date() });

        setIsProcessing(true);
        try {
            const apiResult = await callCaptureImageIntake(file, safeCaption);
            addMessage({
                id: generateId(),
                role: 'assistant',
                text: String(apiResult.chatResponse || 'รับรูปเรียบร้อยครับ'),
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
                if (moduleId) await onRefreshModuleItems(String(moduleId));
            }
        } catch (error: any) {
            console.error('Image capture error:', error);
            addMessage({ id: generateId(), role: 'assistant', text: `Error: ${error?.message || 'Failed to process image'}`, source: 'WEB', timestamp: new Date() });
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Misc ───────────────────────────────────────────────────────────────
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
        handleSendImage,
        handleChatCompletion,
        analyzeLife
    };
};
