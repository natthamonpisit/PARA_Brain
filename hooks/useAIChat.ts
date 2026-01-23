
import { useState } from 'react';
import { ChatMessage, ParaItem, ExistingItemContext, ParaType, FinanceAccount, AppModule, Transaction, ModuleItem } from '../types';
import { analyzeParaInput } from '../services/geminiService';
import { db } from '../services/db'; // Import DB
import { generateId } from '../utils/helpers';
import { GoogleGenAI } from "@google/genai"; // Direct import for manual summarization

interface UseAIChatProps {
  items: ParaItem[];
  accounts: FinanceAccount[];
  modules: AppModule[];
  onAddItem: (item: ParaItem) => Promise<ParaItem>;
  onToggleComplete: (id: string, currentStatus: boolean) => Promise<ParaItem>;
  onAddTransaction: (tx: Transaction) => Promise<void>;
  onAddModuleItem: (item: ModuleItem) => Promise<void>;
  apiKey?: string;
}

export const useAIChat = ({ 
  items, 
  accounts, 
  modules,
  onAddItem, 
  onToggleComplete, 
  onAddTransaction,
  onAddModuleItem,
  apiKey 
}: UseAIChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    role: 'assistant',
    text: 'สวัสดีครับพี่อุ๊ก! เจ (Jay) พร้อมเป็น Brain ผู้ช่วยส่วนตัวในระบบ PARA + Life OS แล้วครับ \n\nตอนนี้ระบบพร้อมใช้งานทั้งงาน (Tasks/Projects) และการเงิน (Finance) ครับ เหมือน Notion for Life ที่ปรับแต่งมาเพื่อพี่โดยเฉพาะ มีอะไรให้เจช่วยจัดระเบียบชีวิตบอกได้เลย!',
    timestamp: new Date()
  }]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const handleSendMessage = async (input: string) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };
    
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setIsProcessing(true);

    try {
      // Prepare Contexts
      const paraContext: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type,
        isCompleted: i.isCompleted
      }));

      const financeContext = {
        accounts: accounts.map(a => ({ id: a.id, name: a.name, balance: a.balance }))
      };

      const moduleContext = modules.map(m => ({
        id: m.id,
        name: m.name,
        fields: m.schemaConfig.fields
      }));

      const result = await analyzeParaInput(input, paraContext, financeContext, moduleContext, currentMessages, apiKey);

      // OPERATION DISPATCHER
      if (result.operation === 'TRANSACTION') {
         const newTx: Transaction = {
             id: generateId(),
             description: result.title || "Transaction from Chat",
             amount: result.amount || 0,
             type: result.transactionType || 'EXPENSE',
             category: result.category || 'General',
             accountId: result.accountId || (accounts.length > 0 ? accounts[0].id : 'unknown'),
             transactionDate: new Date().toISOString()
         };
         await onAddTransaction(newTx);
         addMessage({
             id: generateId(),
             role: 'assistant',
             text: result.chatResponse,
             createdItem: newTx,
             itemType: 'TRANSACTION',
             timestamp: new Date()
         });

      } else if (result.operation === 'MODULE_ITEM') {
         const newItem: ModuleItem = {
             id: generateId(),
             moduleId: result.targetModuleId || '',
             title: result.title || "Entry",
             data: result.moduleData || {},
             tags: result.suggestedTags || [],
             createdAt: new Date().toISOString(),
             updatedAt: new Date().toISOString()
         };
         if (newItem.moduleId) {
            await onAddModuleItem(newItem);
            addMessage({
                id: generateId(),
                role: 'assistant',
                text: result.chatResponse,
                createdItem: newItem,
                itemType: 'MODULE',
                timestamp: new Date()
            });
         } else {
             addMessage({ id: generateId(), role: 'assistant', text: "เจหา Module ไม่เจอครับ รบกวนพี่อุ๊กเช็คอีกทีนะ", timestamp: new Date() });
         }

      } else if (result.operation === 'COMPLETE') {
        const candidateIds = result.relatedItemIdsCandidates || [];
        const candidateItems = items.filter(i => candidateIds.includes(i.id));

        addMessage({
          id: generateId(),
          role: 'assistant',
          text: result.chatResponse,
          suggestedCompletionItems: candidateItems,
          timestamp: new Date()
        });

      } else if (result.operation === 'CREATE') {
        const newItem: ParaItem = {
          id: generateId(),
          title: result.title || "Untitled",
          content: result.summary || "",
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
          createdItem: newItem,
          itemType: 'PARA',
          timestamp: new Date()
        });

      } else {
        // CHAT
        addMessage({
          id: generateId(),
          role: 'assistant',
          text: result.chatResponse,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error(error);
      addMessage({
        id: generateId(),
        role: 'assistant',
        text: "เจขอโทษครับ มีปัญหานิดหน่อย พี่อุ๊กลองใหม่นะ หรือเช็ค API Key หน่อยครับ",
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChatCompletion = async (item: ParaItem) => {
      try {
          await onToggleComplete(item.id, !!item.isCompleted);
          setMessages(prev => prev.map(msg => {
            if (msg.suggestedCompletionItems) {
                return {
                    ...msg,
                    suggestedCompletionItems: msg.suggestedCompletionItems.map(i => 
                        i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i
                    )
                };
            }
            return msg;
        }));
      } catch (e) {
          console.error("Failed to complete from chat", e);
      }
  };

  // --- NEW: Generate Daily Summary ---
  const generateDailySummary = async () => {
    if (!apiKey) throw new Error("API Key Missing");

    // 1. Collect Data (Chat History + Completed Tasks Today)
    const today = new Date().toLocaleDateString();
    const chatLog = messages
        .filter(m => m.timestamp.toLocaleDateString() === today)
        .map(m => `${m.role}: ${m.text}`)
        .join('\n');
    
    const completedTasks = items
        .filter(i => i.isCompleted && new Date(i.updatedAt).toLocaleDateString() === today)
        .map(i => `- ${i.title}`)
        .join('\n');

    const prompt = `
        Summarize the user's day based on this chat log and completed tasks.
        Keep it concise, focusing on what was achieved, what was discussed, and any pending thoughts.
        Language: Thai.
        
        [Completed Tasks]
        ${completedTasks}

        [Chat Log]
        ${chatLog}
    `;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        
        const summaryText = response.text || "No summary generated.";

        // Save to DB via system_logs (using a special type)
        await db.addLog({
            id: generateId(),
            action: 'DAILY_SUMMARY',
            itemTitle: 'Daily Summary',
            itemType: 'System',
            timestamp: new Date().toISOString()
        });
        
        // Also add a special message to chat
        addMessage({
            id: generateId(),
            role: 'assistant',
            text: `📝 **สรุปประจำวันนี้ครับ:**\n\n${summaryText}`,
            timestamp: new Date()
        });

    } catch (e) {
        console.error("Summary failed", e);
        throw e;
    }
  };

  return {
    messages,
    isProcessing,
    handleSendMessage,
    handleChatCompletion,
    generateDailySummary
  };
};
