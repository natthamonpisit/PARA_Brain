import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MagicInput } from './components/MagicInput';
import { ParaBoard } from './components/ParaBoard';
import { ParaType, ParaItem, AIAnalysisResult, ExistingItemContext } from './types';
import { analyzeParaInput } from './services/geminiService';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const generateId = () => Math.random().toString(36).substring(2, 9);

const INITIAL_ITEMS: ParaItem[] = [
  {
    id: '1',
    title: 'Launch Personal Website',
    content: 'Need to finish the landing page and connect the contact form.',
    type: ParaType.PROJECT,
    category: 'Coding',
    tags: ['web', 'react'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Weekly Cardio Routine',
    content: 'Run 5km every Monday, Wednesday, and Friday.',
    type: ParaType.AREA,
    category: 'Health',
    tags: ['running', 'habit'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    title: 'React 18 Concurrent Mode Notes',
    content: 'Key concepts: `useTransition`, `useDeferredValue`. Helps with UI responsiveness.',
    type: ParaType.RESOURCE,
    category: 'Dev Knowledge',
    tags: ['react', 'performance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export default function App() {
  const [items, setItems] = useState<ParaItem[]>(() => {
    const saved = localStorage.getItem('para-items');
    return saved ? JSON.parse(saved) : INITIAL_ITEMS;
  });
  
  const [activeType, setActiveType] = useState<ParaType | 'All'>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    localStorage.setItem('para-items', JSON.stringify(items));
  }, [items]);

  // JAY'S NOTE: Manual JSON Import logic
  // อันนี้ตอบโจทย์ข้อ 2 ของพี่อุ๊กครับ
  const handleManualJsonImport = (jsonInput: string) => {
    try {
        const parsed = JSON.parse(jsonInput);
        // Basic validation
        if (!parsed.type || !parsed.title) throw new Error("Invalid JSON format");

        const newItem: ParaItem = {
            id: generateId(),
            title: parsed.title,
            content: parsed.summary || parsed.content || '',
            type: parsed.type,
            category: parsed.category || 'Inbox',
            tags: parsed.suggestedTags || [],
            relatedItemIds: parsed.relatedItemIdsCandidates || [], // Support relations from manual import
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isAiGenerated: true // Even if manually imported, it came from AI
        };

        setItems(prev => [newItem, ...prev]);
        setNotification({ message: 'Imported successfully!', type: 'success' });
    } catch (e) {
        setNotification({ message: 'Invalid JSON. Please check format.', type: 'error' });
    }
  };

  const handleAiAnalyze = async (input: string) => {
    // Check if user is trying to paste JSON manually (starts with {)
    if (input.trim().startsWith('{')) {
        handleManualJsonImport(input);
        return;
    }

    setIsProcessing(true);
    setNotification(null);

    try {
      // 1. Create context specifically for AI (lighter payload)
      // ส่งแค่ข้อมูลจำเป็นให้ AI หาความสัมพันธ์ (Relation)
      const context: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type
      }));
      
      // 2. Call AI Service
      const result: AIAnalysisResult = await analyzeParaInput(input, context);

      // 3. Create new Item
      const newItem: ParaItem = {
        id: generateId(),
        title: result.title,
        content: result.summary, 
        type: result.type,
        category: result.category,
        tags: result.suggestedTags,
        relatedItemIds: result.relatedItemIdsCandidates, // Here is the relationship magic
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isAiGenerated: true
      };

      // 4. Update State
      setItems(prev => [newItem, ...prev]);
      
      setNotification({
        message: `Saved to ${result.type} / ${result.category}`,
        type: 'success'
      });
      
    } catch (error) {
      console.error(error);
      setNotification({
        message: 'Failed to organize. Please try again.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  };

  const stats = items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      
      <Sidebar 
        activeType={activeType} 
        onSelectType={setActiveType}
        stats={stats}
      />

      <main className="flex-1 md:ml-64 relative min-h-screen">
        
        <header className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur-md border-b border-slate-200 px-8 py-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {activeType === 'All' ? 'Dashboard' : activeType}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Your intelligent second brain
            </p>
          </div>
          
          {notification && (
            <div className={`
              absolute top-6 right-8 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium animate-in slide-in-from-top-2
              ${notification.type === 'success' ? 'bg-white border-green-200 text-green-700' : 'bg-white border-red-200 text-red-700'}
            `}>
              {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {notification.message}
            </div>
          )}
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {/* Pass all items to board so cards can look up their relations */}
          <ParaBoard 
            items={items} 
            activeType={activeType} 
            onDelete={handleDelete}
            allItemsMap={items.reduce((acc, i) => ({...acc, [i.id]: i}), {})}
          />
        </div>
        
        <MagicInput 
          onAnalyze={handleAiAnalyze} 
          isProcessing={isProcessing} 
        />
        
      </main>
    </div>
  );
}
