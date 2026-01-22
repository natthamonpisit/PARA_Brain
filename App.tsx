import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MagicInput } from './components/MagicInput';
import { ParaBoard } from './components/ParaBoard';
import { ParaType, ParaItem, AIAnalysisResult, ExistingItemContext } from './types';
import { analyzeParaInput } from './services/geminiService';
import { db } from './services/db'; // Import Database Service
import { CheckCircle2, AlertCircle, Loader2, KeyRound } from 'lucide-react';

/*
 * -----------------------------------------------------------------------------
 * PROJECT: PARA AI Brain (MVP Version)
 * ARCHITECT: Jay (The Full-stack Guy)
 * -----------------------------------------------------------------------------
 *
 * SYSTEM OVERVIEW (DESIGN DOCUMENT):
 * This is a "Local-First" Personal Knowledge Management (PKM) application based
 * on the PARA Method (Projects, Areas, Resources, Archives).
 *
 * CORE ARCHITECTURE:
 * 1. Client-Side Only (Zero-Backend): 
 *    - We use IndexedDB (browser native DB) to store data.
 *    - Pros: Extremely fast, Private, Free hosting on Vercel, Works offline.
 *    - Cons: Data lives in the browser. Clearing cache wipes data. No native sync.
 *
 * 2. Data Synchronization Strategy:
 *    - Since we don't have a server, we use a "Backup/Restore" pattern.
 *    - Users export a JSON file to transfer data between devices (e.g., Work <-> Home).
 *
 * 3. AI Intelligence Strategy (The "Brain"):
 *    - We don't just ask AI to summarize. We use "Context Injection".
 *    - Every time we send a request, we send a lightweight list of existing items (id, title).
 *    - This allows Gemini to create "Relations" (`relatedItemIds`) automatically, linking
 *      new notes to existing Projects or Areas, mimicking how a human brain connects dots.
 *
 * 4. Fallback Mechanisms:
 *    - If API_KEY is missing, the App switches to "Manual Mode" automatically.
 *    - Users can paste the JSON structure directly to bypass the AI generation step.
 * -----------------------------------------------------------------------------
 */

const generateId = () => Math.random().toString(36).substring(2, 9);

// Mock Data สำหรับ Seed ลง Database ครั้งแรก เพื่อให้ User เห็นภาพการใช้งาน
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
  const [items, setItems] = useState<ParaItem[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true); // State สำหรับรอโหลด DB
  
  const [activeType, setActiveType] = useState<ParaType | 'All'>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'warning'} | null>(null);

  // ---------------------------------------------------------------------------
  // LIFECYCLE: Initialization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadData();
  }, []);

  /**
   * Loads data from IndexedDB.
   * If DB is empty, it seeds initial mock data to prevent a "Blank State" experience.
   */
  const loadData = async () => {
      try {
          setIsLoadingDB(true);
          const data = await db.seedIfEmpty(INITIAL_ITEMS);
          // Sort descending by created date (Newest first)
          const sorted = data.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setItems(sorted);
      } catch (e) {
          console.error("Failed to load DB:", e);
          setNotification({ message: 'Database Error', type: 'error' });
      } finally {
          setIsLoadingDB(false);
      }
  };

  // ---------------------------------------------------------------------------
  // CORE FUNCTION: AI Analysis & Data Insertion
  // ---------------------------------------------------------------------------
  
  /**
   * Handles the Manual JSON import when AI is unavailable or User prefers manual entry.
   * Format: { type, title, content/summary, ... }
   */
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
            isAiGenerated: true 
        };

        // Transactional: Add to DB -> Update State -> Notify
        await db.add(newItem);
        setItems(prev => [newItem, ...prev]);
        setNotification({ message: 'Imported successfully!', type: 'success' });
    } catch (e) {
        setNotification({ message: 'Invalid JSON. Please check format.', type: 'error' });
    }
  };

  /**
   * The "Brain" of the application.
   * 1. Prepares Context (Existing items) to help AI understand the user's current world.
   * 2. Calls Gemini API to classify and organize the input.
   * 3. Saves the structured result to IndexedDB.
   */
  const handleAiAnalyze = async (input: string) => {
    // Detect JSON input for manual override
    if (input.trim().startsWith('{')) {
        await handleManualJsonImport(input); 
        return;
    }

    setIsProcessing(true);
    setNotification(null);

    try {
      // Create lightweight context map (ID, Title, Category) to save Tokens
      const context: ExistingItemContext[] = items.map(i => ({
        id: i.id,
        title: i.title,
        category: i.category,
        type: i.type
      }));
      
      const result: AIAnalysisResult = await analyzeParaInput(input, context);

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
        isAiGenerated: true
      };

      await db.add(newItem);
      setItems(prev => [newItem, ...prev]);
      
      setNotification({
        message: `Saved to ${result.type} / ${result.category}`,
        type: 'success'
      });
      
    } catch (error) {
      console.error(error);
      
      // JAY'S NOTE: Graceful Fallback for Missing Key
      if (error instanceof Error && error.message === "MISSING_API_KEY") {
          setNotification({
            message: 'API Key missing! Try using Manual Import (Paste JSON).',
            type: 'warning'
          });
      } else {
          setNotification({
            message: 'Failed to organize. Please try again.',
            type: 'error'
          });
      }
    } finally {
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
          await db.delete(id);
          setItems(prev => prev.filter(i => i.id !== id));
      } catch (e) {
          console.error("Delete failed:", e);
          setNotification({ message: 'Failed to delete', type: 'error' });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // DATA MANAGEMENT: Backup & Restore (Zero-Server Solution)
  // ---------------------------------------------------------------------------

  /**
   * Exports the entire IndexedDB content as a JSON file.
   * Allows users to migrate data between devices manually.
   */
  const handleExportDB = async () => {
    try {
        const allItems = await db.getAll();
        const dataStr = JSON.stringify(allItems, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `para-brain-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setNotification({ message: 'Backup downloaded!', type: 'success' });
    } catch (e) {
        setNotification({ message: 'Export failed', type: 'error' });
    }
  };

  /**
   * Imports a JSON file and REPLACES the current database.
   * CRITICAL: This is a destructive operation (Wipe & Load).
   */
  const handleImportDB = async (file: File) => {
      if (!window.confirm('This will REPLACE all current data with the backup. Continue?')) {
          return;
      }
      
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const content = e.target?.result as string;
              const parsedData = JSON.parse(content) as ParaItem[];
              
              if (!Array.isArray(parsedData)) throw new Error("Invalid backup file");

              setIsLoadingDB(true);
              await db.clear(); // 1. Wipe clean
              await db.bulkAdd(parsedData); // 2. Insert new
              await loadData(); // 3. Refresh UI
              
              setNotification({ message: 'Database restored successfully!', type: 'success' });
          } catch (err) {
              console.error(err);
              setNotification({ message: 'Invalid backup file', type: 'error' });
              setIsLoadingDB(false);
          }
      };
      reader.readAsText(file);
  };

  const stats = items.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (isLoadingDB) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                  <p className="text-slate-500 font-medium">Loading your second brain...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
      
      <Sidebar 
        activeType={activeType} 
        onSelectType={setActiveType}
        stats={stats}
        onExport={handleExportDB}
        onImport={handleImportDB}
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
              absolute top-6 right-8 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium animate-in slide-in-from-top-2 z-50
              ${notification.type === 'success' ? 'bg-white border-green-200 text-green-700' : 
                notification.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-white border-red-200 text-red-700'}
            `}>
              {notification.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {notification.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {notification.type === 'warning' && <KeyRound className="w-4 h-4" />}
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
