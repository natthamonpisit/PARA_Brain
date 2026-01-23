import React, { useRef, useEffect, useState } from 'react';
import { Send, Bot, User, Loader2, ArrowRight, Database, FileJson, CheckCircle2 } from 'lucide-react';
import { ChatMessage, ParaType, ParaItem, Transaction, ModuleItem } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  // JAY'S NOTE: New prop to handle completion click from chat
  onCompleteTask?: (item: ParaItem) => void; 
  isProcessing: boolean;
  className?: string; 
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
    messages, 
    onSendMessage, 
    onCompleteTask,
    isProcessing, 
    className = '' 
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  const isJsonInput = input.trim().startsWith('{');

  const renderCreatedItemCard = (msg: ChatMessage) => {
    if (!msg.createdItem) return null;

    let typeLabel = 'ITEM';
    let categoryLabel = 'General';
    let titleLabel = 'Untitled';

    if (msg.itemType === 'TRANSACTION') {
        const tx = msg.createdItem as Transaction;
        typeLabel = tx.type;
        categoryLabel = tx.category;
        titleLabel = tx.description;
    } else if (msg.itemType === 'MODULE') {
        const modItem = msg.createdItem as ModuleItem;
        typeLabel = 'MODULE';
        categoryLabel = modItem.tags?.[0] || 'Data';
        titleLabel = modItem.title;
    } else {
        // PARA
        const para = msg.createdItem as ParaItem;
        typeLabel = para.type;
        categoryLabel = para.category;
        titleLabel = para.title;
    }

    return (
        <div className="bg-white rounded-lg border border-indigo-100 p-2 shadow-sm">
            <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{typeLabel}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded">{categoryLabel}</span>
            </div>
            <div className="font-medium text-slate-800 text-sm truncate">{titleLabel}</div>
        </div>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-white border-l border-slate-200 shadow-xl z-20 ${className}`}>
      
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-800">
          <Bot className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-sm">AI Copilot</h3>
        </div>
        <p className="text-xs text-slate-500 mt-1">Consult & Organize your thoughts</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/30" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center mt-10 text-slate-400">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Hello! I'm ready.</p>
            <p className="text-xs mt-1">Tell me about your project, idea, or task.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            
            {/* Sender Name */}
            <div className="flex items-center gap-2 mb-1 px-1">
              {msg.role === 'assistant' ? (
                 <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Gemini</span>
              ) : (
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">You</span>
              )}
            </div>

            {/* Bubble */}
            <div className={`
              max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
              ${msg.role === 'user' 
                ? 'bg-slate-800 text-white rounded-br-none' 
                : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'}
            `}>
              {msg.text}
            </div>

            {/* JAY'S NOTE: "Action Report" Card - Created Item */}
            {msg.createdItem && (
              <div className="mt-2 w-[90%] bg-indigo-50 border border-indigo-100 rounded-xl p-3 animate-in slide-in-from-left-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 mb-2">
                  <Database className="w-3 h-3" />
                  <span>Saved to Database</span>
                </div>
                {renderCreatedItemCard(msg)}
              </div>
            )}

            {/* JAY'S NOTE: "Completion Suggestion" Cards */}
            {msg.suggestedCompletionItems && msg.suggestedCompletionItems.length > 0 && (
                 <div className="mt-2 w-[90%] bg-emerald-50 border border-emerald-100 rounded-xl p-3 animate-in slide-in-from-left-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 mb-2">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Did you mean to complete these?</span>
                    </div>
                    <div className="space-y-2">
                        {msg.suggestedCompletionItems.map(item => (
                            <div key={item.id} className="bg-white rounded-lg border border-emerald-100 p-2 shadow-sm flex items-center justify-between">
                                <div className="flex-1 min-w-0 mr-2">
                                     <div className="font-medium text-slate-800 text-xs truncate">{item.title}</div>
                                     <div className="text-[10px] text-slate-400">{item.category}</div>
                                </div>
                                <button 
                                    onClick={() => onCompleteTask && onCompleteTask(item)}
                                    disabled={item.isCompleted}
                                    className={`
                                        px-2 py-1 rounded text-[10px] font-bold transition-colors
                                        ${item.isCompleted 
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}
                                    `}
                                >
                                    {item.isCompleted ? 'Done' : 'Complete'}
                                </button>
                            </div>
                        ))}
                    </div>
                 </div>
            )}
            
            {/* Timestamp */}
            <span className="text-[10px] text-slate-300 mt-1 px-1">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-slate-400 text-xs px-4">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Analyzing...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100 flex-shrink-0">
        <form onSubmit={handleSubmit} className="relative">
            {isJsonInput && (
                <div className="absolute -top-8 left-0 text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded flex items-center gap-1">
                    <FileJson className="w-3 h-3" />
                    JSON Import Mode
                </div>
            )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder="Type your thought..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={`
              absolute right-2 top-2 p-1.5 rounded-lg transition-colors
              ${input.trim() && !isProcessing 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
            `}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};