
import React, { useState, useEffect } from 'react';
import { X, Send, AlertTriangle, CheckCircle2, Server, Lock, Zap, Copy, Globe, MessageSquare } from 'lucide-react';
import { lineService } from '../services/lineService';

interface LineConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LineConnectModal: React.FC<LineConnectModalProps> = ({ isOpen, onClose }) => {
  const [testMessage, setTestMessage] = useState('Test Message: Vercel Function is working! 🚀');
  const [status, setStatus] = useState<'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        // Construct the webhook URL dynamically based on current origin
        setWebhookUrl(`${window.location.origin}/api/line-webhook`);
    }
  }, []);

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
        // Handle common Vercel/Vite local dev issue
        if (error.message && error.message.includes('<')) {
            setErrorMessage('HTML response received. Please test on Vercel deployment (local /api not found).');
        } else {
            setErrorMessage(error.message || 'Failed to send message.');
        }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
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

        <div className="p-6 overflow-y-auto space-y-8">
            
            {/* SECTION 1: Webhook Configuration */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</div>
                    <h3>Webhook Configuration (Receive Messages)</h3>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500 mb-2">
                        Copy this URL and paste it into <b>LINE Developers Console &gt; Messaging API &gt; Webhook URL</b>
                    </p>
                    <div className="flex gap-2">
                        <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate flex items-center gap-2">
                            <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            {webhookUrl}
                        </div>
                        <button 
                            onClick={handleCopy}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                        >
                            {copied ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <div className="mt-2 text-[10px] text-orange-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Ensure "Use Webhook" is enabled in LINE Console.</span>
                    </div>
                </div>
            </div>

            <div className="h-px bg-slate-100 w-full"></div>

            {/* SECTION 2: Outbound Test */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">2</div>
                    <h3>Test Outbound Alert (Send to You)</h3>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    {/* Config Check */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <Lock className="w-3 h-3" />
                        <span>Target: LINE_USER_ID (Env Var)</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            Message to Send
                        </label>
                        <textarea 
                            rows={2}
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none resize-none"
                        />
                    </div>

                    {status === 'SUCCESS' && (
                        <div className="flex items-center gap-2 text-green-600 text-xs bg-green-50 p-2 rounded-lg">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Message sent! Check your LINE.</span>
                        </div>
                    )}
                    
                    {status === 'ERROR' && (
                        <div className="flex items-start gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <button 
                        onClick={handleTestSend}
                        disabled={status === 'SENDING'}
                        className="w-full py-2 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {status === 'SENDING' ? 'Sending...' : 'Send Test Message'}
                        {!status.includes('SENDING') && <Send className="w-3 h-3" />}
                    </button>
                </div>
            </div>
            
            <p className="text-center text-[10px] text-slate-400">
                <Server className="w-3 h-3 inline-block mr-1" />
                Powered by Vercel Serverless Functions
            </p>
        </div>

      </div>
    </div>
  );
};
