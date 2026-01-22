import React, { useState } from 'react';
import { Sparkles, ArrowUp, Loader2, FileJson } from 'lucide-react';

interface MagicInputProps {
  onAnalyze: (input: string) => Promise<void>;
  isProcessing: boolean;
}

// JAY'S NOTE: Component นี้คือหน้าด่านสำคัญครับ
// ออกแบบให้เหมือน Chat bar แต่เน้นการ "สั่งงาน" หรือ "จดบันทึก"
export const MagicInput: React.FC<MagicInputProps> = ({ onAnalyze, isProcessing }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    onAnalyze(input);
    setInput('');
  };
  
  const isJsonInput = input.trim().startsWith('{');

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      <form 
        onSubmit={handleSubmit}
        className="relative group"
      >
        <div className={`
          absolute -inset-0.5 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-2xl opacity-75 blur 
          transition duration-1000 group-hover:duration-200
          ${isProcessing ? 'animate-pulse' : 'group-hover:opacity-100 opacity-30'}
        `}></div>
        
        <div className="relative flex items-center bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="pl-4 text-purple-500">
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isJsonInput ? (
               <FileJson className="w-6 h-6 text-orange-500" />
            ) : (
              <Sparkles className="w-6 h-6" />
            )}
          </div>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isProcessing}
            placeholder={isProcessing ? "AI is organizing your thought..." : "Type a note, or paste JSON to import..."}
            className="w-full py-4 px-4 bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium"
          />
          
          <button 
            type="submit"
            disabled={!input.trim() || isProcessing}
            className={`
              mr-2 p-2 rounded-xl transition-all
              ${input.trim() && !isProcessing 
                ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900' 
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed'}
            `}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
        </div>
      </form>
      
      {/* Help Text */}
      <div className="text-center mt-2 text-xs text-slate-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
        {isJsonInput ? "Manual JSON Import Mode" : "Powered by Gemini 3 Flash • PARA Method"}
      </div>
    </div>
  );
};
