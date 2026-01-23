
import { useState, useEffect, useRef } from 'react';
import { ChatMessage, ParaItem, ExistingItemContext, ParaType, FinanceAccount, AppModule, Transaction, ModuleItem, HistoryLog, DailySummary } from '../types';
import { analyzeParaInput } from '../services/geminiService';
import { db } from '../services/db'; 
import { generateId } from '../utils/helpers';
import { GoogleGenAI } from "@google/genai";

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
  
  // Cache for Long-term memory
  const [recentSummaries, setRecentSummaries] = useState<DailySummary[]>([]);
  const hasCheckedSummary = useRef(false);

  // --- AUTOMATIC DAILY SUMMARY CHECKER ---
  useEffect(() => {
    const checkAndGenerateSummary = async () => {
        if (!apiKey || hasCheckedSummary.current) return;
        
        hasCheckedSummary.current = true; // Prevent double check on remount

        // 1. Load Recent Summaries for Context
        try {
            const summaries = await db.getRecentSummaries();
            setRecentSummaries(summaries);

            // 2. Check if "Yesterday" has a summary
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            const existingSummary = await db.getSummaryByDate(yesterdayStr);
            
            if (!existingSummary) {
                console.log("No summary for yesterday (" + yesterdayStr + "). Generating...");
                await generateSilentSummary(yesterdayStr);
                // Refresh context
                const updatedSummaries = await db.getRecentSummaries();
                setRecentSummaries(updatedSummaries);
            } else {
                console.log("Summary for yesterday already exists.");
            }

        } catch (e) {
            console.error("Auto-summary check failed:", e);
        }
    };

    if (apiKey) {
        checkAndGenerateSummary();
    }
  }, [apiKey]);

  // Internal function to generate summary without user interaction
  const generateSilentSummary = async (dateStr: string) => {
      // Fetch activity logs for that specific date
      const logs = await db.getLogs(dateStr); 
      // Note: getLogs(startDate) fetches logs *after* that date. 
      // To be precise we should filter logs strictly for that day, but for now getting "recent" is okay-ish.
      // Better: filter in JS
      const targetDateLogs = logs.filter(l => l.timestamp.startsWith(dateStr));
      
      if (targetDateLogs.length === 0) {
          console.log("No activity yesterday to summarize.");
          return;
      }

      const activities = targetDateLogs.map(l => `- ${l.action}: ${l.itemTitle} (${l.itemType})`).join('\n');
      
      const ai = new GoogleGenAI({ apiKey: apiKey! });
      const prompt = `
        Summarize the user's activity for ${dateStr} based on these logs.
        Focus on what was achieved (COMPLETED) and created.
        Keep it very short (2-3 sentences).
        Language: Thai.
        
        LOGS:
        ${activities}
      `;

      try {
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt
          });
          const text = response.text || "No summary.";
          
          await db.addDailySummary({
              id: generateId(),
              date: dateStr,
              summary: text,
              key_achievements: [], // Simplified for now
              created_at: new Date().toISOString()
          });
          console.log("Generated & Saved Summary for " + dateStr);
      } catch (e) {
          console.error("Silent summary generation failed", e);
      }
  };

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

      // Pass recentSummaries to the AI Service
      const result = await analyzeParaInput(
          input, 
          paraContext, 
          financeContext, 
          moduleContext, 
          currentMessages, 
          apiKey, 
          recentSummaries
      );

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

      } else if (result.operation === 'BATCH_CREATE' && result.batchItems) {
         // --- BATCH CREATE LOGIC ---
         const createdItems: ParaItem[] = [];
         
         for (const item of result.batchItems) {
             const newItem: ParaItem = {
                 id: generateId(),
                 title: item.title || "Untitled",
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
             await onAddItem(newItem);
             createdItems.push(newItem);
         }

         addMessage({
             id: generateId(),
             role: 'assistant',
             text: result.chatResponse,
             createdItems: createdItems, // Pass array for UI
             itemType: 'PARA',
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

  // --- NEW: Generate Daily Summary (Manual Trigger) ---
  // Keeping this for "Force Summary" if needed, but UI button is removed.
  const generateDailySummary = async () => {
    if (!apiKey) throw new Error("API Key Missing");

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
        Keep it concise. Language: Thai.
        
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

        await db.addLog({
            id: generateId(),
            action: 'DAILY_SUMMARY',
            itemTitle: 'Daily Summary',
            itemType: 'System',
            timestamp: new Date().toISOString()
        });

        // Also save to the new Table
        const todayStr = new Date().toISOString().split('T')[0];
        await db.addDailySummary({
            id: generateId(),
            date: todayStr,
            summary: summaryText,
            key_achievements: [],
            created_at: new Date().toISOString()
        });
        
        addMessage({
            id: generateId(),
            role: 'assistant',
            text: `📝 **สรุปประจำวันนี้ (Manual):**\n\n${summaryText}`,
            timestamp: new Date()
        });

    } catch (e) {
        console.error("Summary failed", e);
        throw e;
    }
  };

  const analyzeLife = async (historyLogs: HistoryLog[], transactions: Transaction[]) => {
      if (!apiKey) throw new Error("API Key Missing");

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentHistory = historyLogs.filter(l => new Date(l.timestamp) > thirtyDaysAgo);
      const recentTx = transactions.filter(t => new Date(t.transactionDate) > thirtyDaysAgo);

      const taskLog = recentHistory
        .filter(h => h.action === 'COMPLETE')
        .map(h => `- Completed: ${h.itemTitle} (${h.itemType}) on ${new Date(h.timestamp).toLocaleDateString()}`)
        .join('\n');

      const financeLog = recentTx
        .map(t => `- ${t.type}: ${t.amount} (${t.category})`)
        .join('\n');

      const prompt = `
        Role: You are a Life Coach Analyst.
        Task: Analyze last 30 days.
        Identify patterns, strengths, weaknesses, and provide 3 key actionable improvements.
        
        Language: Thai.
        Format: Markdown.

        DATA:
        [Productivity]
        ${taskLog || "No completed tasks."}

        [Finance]
        ${financeLog || "No transactions."}
      `;

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt
      });

      return response.text || "Could not generate analysis.";
  };

  return {
    messages,
    isProcessing,
    handleSendMessage,
    handleChatCompletion,
    generateDailySummary,
    analyzeLife
  };
};