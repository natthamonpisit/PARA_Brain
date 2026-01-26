
import { useState, useCallback } from 'react';
import { ParaItem, ChatMessage, FinanceAccount, AppModule, ParaType, Transaction, ModuleItem } from '../types';
import { analyzeLifeOS, performLifeAnalysis } from '../services/geminiService';
import { generateId } from '../utils/helpers';
import { HistoryLog } from '../types';

interface UseAIChatProps {
    items: ParaItem[];
    accounts: FinanceAccount[];
    modules: AppModule[];
    onAddItem: (item: ParaItem) => Promise<any>;
    onToggleComplete: (id: string, status: boolean) => Promise<any>;
    onAddTransaction: (tx: Transaction) => Promise<any>;
    onAddModuleItem: (item: ModuleItem) => Promise<any>;
}

export const useAIChat = ({ items, accounts, modules, onAddItem, onToggleComplete, onAddTransaction, onAddModuleItem }: UseAIChatProps) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const addMessage = (msg: ChatMessage) => {
        setMessages(prev => [...prev, msg]);
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        addMessage({
            id: generateId(),
            role: 'user',
            text: text,
            timestamp: new Date()
        });

        setIsProcessing(true);

        try {
            // Build Context Strings
            const recentHistory = messages.slice(-5).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
            
            const result = await analyzeLifeOS(text, {
                paraItems: items,
                financeContext: { accounts },
                modules: modules,
                recentContext: recentHistory
            });

            // Handle Operations
            if (result.operation === 'CHAT') {
                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    timestamp: new Date()
                });

            } else if (result.operation === 'COMPLETE') {
                // Find candidates to complete
                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    timestamp: new Date()
                });

            } else if (result.operation === 'BATCH_CREATE' && result.batchItems) {
                const createdItems: ParaItem[] = [];
                let newlyCreatedProjectId: string | null = null;
                
                for (const item of result.batchItems) {
                    // FALLBACK TITLE LOGIC
                    const finalTitle = item.title || "New Item";

                    const newItem: ParaItem = {
                        id: generateId(),
                        title: finalTitle,
                        content: item.summary || "",
                        type: item.type || ParaType.TASK,
                        category: item.category || "Inbox",
                        tags: item.suggestedTags || [],
                        relatedItemIds: [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        isAiGenerated: true,
                        isCompleted: false
                    };

                    if (newItem.type === ParaType.TASK && newlyCreatedProjectId) {
                        newItem.relatedItemIds = [newlyCreatedProjectId];
                    }

                    await onAddItem(newItem);
                    
                    if (newItem.type === ParaType.PROJECT) {
                        newlyCreatedProjectId = newItem.id;
                    }

                    createdItems.push(newItem);
                }

                addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    createdItems: createdItems,
                    itemType: 'PARA',
                    timestamp: new Date()
                });

            } else if (result.operation === 'CREATE') {
                // SMART FALLBACK: If AI still sends null title (very unlikely with new schema), use input text truncated.
                const finalTitle = result.title || (text.length > 30 ? text.substring(0, 30) + "..." : text);

                const newItem: ParaItem = {
                    id: generateId(),
                    title: finalTitle,
                    content: result.summary || text, // Ensure content has something
                    type: result.type || ParaType.TASK,
                    category: result.category || "Inbox",
                    tags: result.suggestedTags || [],
                    relatedItemIds: [],
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
                    createdItem: newItem,
                    itemType: 'PARA',
                    timestamp: new Date()
                });

            } else if (result.operation === 'TRANSACTION') {
                // Transaction Description Fallback
                const txDesc = result.title || (text.length > 40 ? text.substring(0, 40) + "..." : text);

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
                    addMessage({
                        id: generateId(),
                        role: 'assistant',
                        text: result.chatResponse,
                        createdItem: newTx,
                        itemType: 'TRANSACTION',
                        timestamp: new Date()
                    });
                } else {
                     addMessage({
                        id: generateId(),
                        role: 'assistant',
                        text: "I couldn't find a valid account for this transaction. Please create one first.",
                        timestamp: new Date()
                    });
                }

            } else if (result.operation === 'MODULE_ITEM') {
                if (result.targetModuleId) {
                    const modData: Record<string, any> = {};
                    if (result.moduleDataRaw) {
                        result.moduleDataRaw.forEach(f => {
                             // Simple type inference
                             const numVal = Number(f.value);
                             modData[f.key] = isNaN(numVal) ? f.value : numVal;
                        });
                    }
                    
                    const newItem: ModuleItem = {
                        id: generateId(),
                        moduleId: result.targetModuleId,
                        title: result.title || "New Entry",
                        data: modData,
                        tags: result.suggestedTags || [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    await onAddModuleItem(newItem);
                    
                    addMessage({
                        id: generateId(),
                        role: 'assistant',
                        text: result.chatResponse,
                        createdItem: newItem,
                        itemType: 'MODULE',
                        timestamp: new Date()
                    });
                }
            } else {
                 // Fallback
                 addMessage({
                    id: generateId(),
                    role: 'assistant',
                    text: result.chatResponse,
                    timestamp: new Date()
                });
            }

        } catch (error: any) {
            console.error("AI Error:", error);
            addMessage({
                id: generateId(),
                role: 'assistant',
                text: `Sorry, I encountered an error: ${error.message}`,
                timestamp: new Date()
            });
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
