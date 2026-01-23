
import { useState } from 'react';
import { ChatMessage, ParaItem, ExistingItemContext, ParaType } from '../types';
import { analyzeParaInput } from '../services/geminiService';
import { generateId } from '../utils/helpers';

interface UseAIChatProps {
  items: ParaItem[];
  onAddItem: (item: ParaItem) => Promise<ParaItem>;
  onToggleComplete: (id: string, currentStatus: boolean) => Promise<ParaItem>;
  apiKey?: string;
}

export const useAIChat = ({ items, onAddItem, onToggleComplete, apiKey }: UseAIChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    role: 'assistant',
    text: 'Hello! I am Jay, your Personal Architect. What is on your mind today? We can organize your projects, or just talk through your ideas.',
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
      const context: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type,
        isCompleted: i.isCompleted
      }));

      const result = await analyzeParaInput(input, context, currentMessages, apiKey);

      if (result.operation === 'CHAT') {
        addMessage({
          id: generateId(),
          role: 'assistant',
          text: result.chatResponse,
          timestamp: new Date()
        });
      } else if (result.operation === 'COMPLETE') {
        const candidateIds = result.relatedItemIdsCandidates || [];
        const candidateItems = items.filter(i => candidateIds.includes(i.id));

        addMessage({
          id: generateId(),
          role: 'assistant',
          text: result.chatResponse, // Use conversational response
          suggestedCompletionItems: candidateItems,
          timestamp: new Date()
        });
      } else {
        // CREATE
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
          text: result.chatResponse, // Use the human-like response
          createdItem: newItem,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error(error);
      addMessage({
        id: generateId(),
        role: 'assistant',
        text: "I hit a snag while processing that. Is your API Key set correctly?",
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

  return {
    messages,
    isProcessing,
    handleSendMessage,
    handleChatCompletion
  };
};
