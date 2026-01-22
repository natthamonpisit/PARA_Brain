
import { useState } from 'react';
import { ChatMessage, ParaItem, ExistingItemContext } from '../types';
import { analyzeParaInput } from '../services/geminiService';
import { generateId } from '../utils/helpers';

interface UseAIChatProps {
  items: ParaItem[];
  onAddItem: (item: ParaItem) => Promise<ParaItem>;
  onToggleComplete: (id: string, currentStatus: boolean) => Promise<ParaItem>;
}

export const useAIChat = ({ items, onAddItem, onToggleComplete }: UseAIChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    role: 'assistant',
    text: 'Welcome back! I am your PARA AI. Tell me what is on your mind, and I will organize it for you.',
    timestamp: new Date()
  }]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const updateMessage = (id: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  // Logic for manual JSON import
  const handleManualJsonImport = async (jsonInput: string) => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.type || !parsed.title) throw new Error("Invalid JSON format");

      const newItem: ParaItem = {
        id: generateId(),
        title: parsed.title,
        content: parsed.summary || parsed.content || '',
        type: parsed.type,
        category: parsed.category || 'Inbox',
        tags: parsed.suggestedTags || [],
        relatedItemIds: parsed.relatedItemIdsCandidates || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAiGenerated: true,
        isCompleted: false
      };

      await onAddItem(newItem);
      
      addMessage({
        id: generateId(),
        role: 'assistant',
        text: 'I have manually imported the JSON data.',
        createdItem: newItem,
        timestamp: new Date()
      });
    } catch (e) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        text: 'Error importing JSON. Please check the format.',
        timestamp: new Date()
      });
    }
  };

  // Core Chat Logic
  const handleSendMessage = async (input: string) => {
    // 1. Add User Message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };
    
    // Optimistic update for UI speed
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);

    // Check for JSON mode
    if (input.trim().startsWith('{')) {
      await handleManualJsonImport(input);
      return;
    }

    setIsProcessing(true);

    try {
      // 2. Prepare Context
      const context: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type,
        isCompleted: i.isCompleted
      }));

      // 3. Call AI Service
      const result = await analyzeParaInput(input, context, currentMessages);

      // 4. Handle Result
      if (result.operation === 'COMPLETE') {
        const candidateIds = result.relatedItemIdsCandidates || [];
        const candidateItems = items.filter(i => candidateIds.includes(i.id));

        if (candidateItems.length > 0) {
          addMessage({
            id: generateId(),
            role: 'assistant',
            text: result.reasoning || "I found these tasks. Would you like to mark them as done?",
            suggestedCompletionItems: candidateItems,
            timestamp: new Date()
          });
        } else {
          addMessage({
            id: generateId(),
            role: 'assistant',
            text: "I understand you finished something, but I couldn't find a matching task in your database.",
            timestamp: new Date()
          });
        }
      } else {
        // Create New Item
        const newItem: ParaItem = {
          id: generateId(),
          title: result.title,
          content: result.summary,
          type: result.type,
          category: result.category,
          tags: result.suggestedTags,
          relatedItemIds: result.relatedItemIdsCandidates,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isAiGenerated: true,
          isCompleted: false
        };

        await onAddItem(newItem);

        addMessage({
          id: generateId(),
          role: 'assistant',
          text: result.reasoning || `I've organized this into your ${result.type}.`,
          createdItem: newItem,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error(error);
      let errorMsg = "I'm having trouble connecting to my brain right now.";
      if (error instanceof Error && error.message === "MISSING_API_KEY") {
        errorMsg = "I can't access the API Key. Please verify your deployment settings.";
      }
      addMessage({
        id: generateId(),
        role: 'assistant',
        text: errorMsg,
        timestamp: new Date()
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChatCompletion = async (item: ParaItem) => {
      try {
          await onToggleComplete(item.id, !!item.isCompleted);
          
          // Update chat UI to reflect change without re-fetching everything
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

  return {
    messages,
    isProcessing,
    handleSendMessage,
    handleChatCompletion
  };
};
