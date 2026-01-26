
import React, { useState, useEffect, useRef } from 'react';
import { X, Send, AlertTriangle, CheckCircle2, Server, Lock, Zap, Copy, Globe, MessageSquare, Terminal, RefreshCw, Activity, PauseCircle, PlayCircle } from 'lucide-react';
import { lineService } from '../services/lineService';
import { supabase } from '../services/supabase';
import { SystemLog } from '../types';

interface LineConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LineConnectModal: React.FC<LineConnectModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'SETUP' | 'LOGS'>('SETUP');
  const [testMessage, setTestMessage] = useState('Test Message: Vercel Function is working! 🚀');
  const [status, setStatus] = useState<'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Logs State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setWebhookUrl(`${window.location.origin}/api/line-webhook`);
    }
  }, []);

  // Fetch logs on open/tab change
  useEffect(() => {
      if (isOpen && activeTab === 'LOGS') {
          fetchLogs();
      }
      return () => stopAutoRefresh();
  }, [isOpen, activeTab]);

  // Handle Auto Refresh
  useEffect(() => {
      if (isAutoRefresh && isOpen && activeTab === 'LOGS') {
          intervalRef.current = setInterval(fetchLogs, 3000); // Poll every 3s
      } else {
          stopAutoRefresh();
      }
      return () => stopAutoRefresh();
  }, [isAutoRefresh, isOpen, activeTab]);

  const stopAutoRefresh = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const fetchLogs = async () => {
      // Don't show loading spinner on auto-refresh to avoid flickering
      if (!isAutoRefresh) setLoadingLogs(true);
      
      try {
          const { data, error } = await supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
          
          if (error) {
              console.error(error);
          } else {
              setLogs(data as SystemLog[]);
          }
      } catch (e) {
          console.error(e);
      } finally {
          if (!isAutoRefresh) setLoadingLogs(false);
      }
  };

  const handleCopy = () => {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const handleTestSend = async () => {
    setStatus('SENDING');
    setErrorMessage('');
    
    try {
        await lineService.sendPushMessage(testMessage);
        setStatus('SUCCESS');
    } catch (error: any) {
        console.error(error);
        setStatus('ERROR');
        if (error.message && error.message.includes('<')) {
            setErrorMessage('HTML response received. Please test on Vercel deployment.');
        } else {
            setErrorMessage(error.message || 'Failed to send message.');
        }
    }
  };

  // Helper to format JSON response for display
  const formatAIResponse = (response: string | undefined) => {
      if (!response) return <span className="text-slate-500 italic">Thinking...</span>;
      try {
          // If response looks like JSON (starts with {), try to pretty print
          if (response.trim().startsWith('{')) {
             const json = JSON.parse(response);
             return (
                 <pre className="text-[10px] text-emerald-400 overflow-x-auto custom-scrollbar">
                     {JSON.stringify(json, null, 2)}
                 </pre>
             );
          }
          return <span className="text-emerald-400">{response}</span>;
      } catch (e) {
          return <span className="text-emerald-400">{response}</span>;
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#06C755] px-6 py-4 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-2 font-bold">
                <MessageSquare className="w-6 h-6 fill-white text-[#06C755]" />
                <span>LINE Integration Console</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50">
            <button 
                onClick={() => setActiveTab('SETUP')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'SETUP' ? 'bg-white text-[#06C755] border-t-2 border-[#06C755]' : 'text-slate-400'}`}
            >
                <Zap className="w-4 h-4" /> Setup & Test
            </button>
            <button 
                onClick={() => setActiveTab('LOGS')}
                className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'LOGS' ? 'bg-white text-indigo-600 border-t-2 border-indigo-600' : 'text-slate-400'}`}
            >
                <Terminal className="w-4 h-4" /> Live Logs (Debug)
            </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white custom-scrollbar">
            
            {/* --- SETUP TAB --- */}
            {activeTab === 'SETUP' && (
                <>
                    {/* IMPORTANT WARNING */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-bold text-orange-700 text-sm">Critical Setting: Webhook Redelivery</h4>
                            <p className="text-xs text-orange-600 mt-1 leading-relaxed">
                                Because AI takes time to think (5-10s), LINE might timeout and resend messages, causing duplicates.
                            </p>
                            <p className="text-xs font-bold text-orange-700 mt-2">
                                👉 Go to LINE Developers Console &gt; Messaging API &gt; Webhook settings and DISABLE "Webhook redelivery".
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-800 font-bold">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</div>
                            <h3>Webhook Configuration</h3>
                        </div>
                        
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs text-slate-500 mb-2">
                                Paste into <b>LINE Developers Console &gt; Webhook URL</b>
                            </p>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate flex items-center gap-2">
                                    <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                    {webhookUrl}
                                </div>
                                <button onClick={handleCopy} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1">
                                    {copied ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-slate-800 font-bold">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">2</div>
                            <h3>Test Outbound (Push Message)</h3>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <textarea 
                                rows={2}
                                value={testMessage}
                                onChange={(e) => setTestMessage(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none resize-none"
                            />
                            {status === 'SUCCESS' && <div className="text-green-600 text-xs flex gap-1"><CheckCircle2 className="w-3 h-3"/> Sent!</div>}
                            {status === 'ERROR' && <div className="text-red-600 text-xs flex gap-1"><AlertTriangle className="w-3 h-3"/> {errorMessage}</div>}
                            
                            <button 
                                onClick={handleTestSend}
                                disabled={status === 'SENDING'}
                                className="w-full py-2 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-lg shadow-sm"
                            >
                                {status === 'SENDING' ? 'Sending...' : 'Send Test'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* --- LOGS TAB --- */}
            {activeTab === 'LOGS' && (
                <div className="h-full flex flex-col">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <div>
                            <p className="text-sm font-bold text-slate-800">System Logs</p>
                            <p className="text-[10px] text-slate-500">Real-time interactions from the webhook.</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isAutoRefresh ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200'}`}
                            >
                                {isAutoRefresh ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                                {isAutoRefresh ? 'Auto On' : 'Auto Off'}
                            </button>
                            <button 
                                onClick={() => fetchLogs()} 
                                className="p-2 hover:bg-slate-100 rounded-lg text-indigo-600 border border-transparent hover:border-slate-200 transition-all"
                                title="Refresh Now"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingLogs ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {logs.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl py-10 bg-slate-50/50">
                            <Activity className="w-10 h-10 mb-2 opacity-20" />
                            <p className="text-sm">No logs found.</p>
                            <p className="text-xs mt-1">Try chatting with your LINE bot first.</p>
                            <div className="mt-4 p-3 bg-red-50 text-red-500 rounded-lg text-[10px] max-w-xs text-center border border-red-100">
                                Warning: Ensure 'system_logs' table exists in Supabase.
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 overflow-y-auto pr-1">
                            {logs.map(log => (
                                <div key={log.id} className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs shadow-lg border border-slate-800 relative group transition-all hover:border-slate-700">
                                    {/* Status Badge */}
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        {log.status === 'PROCESSING' && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 border border-blue-800">
                                                <RefreshCw className="w-3 h-3 animate-spin" /> Thinking
                                            </span>
                                        )}
                                        {log.status === 'SUCCESS' && (
                                            <span className="px-1.5 py-0.5 rounded bg-green-900/50 text-green-400 border border-green-800">SUCCESS</span>
                                        )}
                                        {(log.status === 'ERROR' || log.status === 'DB_FAILED') && (
                                            <span className="px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">{log.status}</span>
                                        )}
                                    </div>

                                    {/* Meta Header */}
                                    <div className="flex items-center gap-3 mb-3 border-b border-slate-800 pb-2">
                                        <span className="text-[10px] text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                                        <span className={`text-[10px] font-bold px-1.5 rounded ${
                                            log.action_type === 'THINKING' ? 'bg-slate-800 text-slate-400' : 
                                            log.action_type === 'ERROR' ? 'bg-red-900 text-white' : 
                                            'bg-indigo-900 text-indigo-300'
                                        }`}>
                                            {log.action_type || 'UNKNOWN'}
                                        </span>
                                    </div>

                                    <div className="grid gap-3">
                                        {/* User Input */}
                                        <div className="flex gap-2">
                                            <span className="text-slate-500 font-bold w-12 text-right shrink-0">USER:</span>
                                            <div className="text-white bg-slate-800 px-2 py-1 rounded w-full break-words">
                                                {log.user_message}
                                            </div>
                                        </div>

                                        {/* AI Output */}
                                        <div className="flex gap-2">
                                            <span className="text-emerald-600 font-bold w-12 text-right shrink-0">AI:</span>
                                            <div className="w-full bg-slate-950 border border-slate-800 px-2 py-1 rounded break-words whitespace-pre-wrap">
                                                {formatAIResponse(log.ai_response)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
