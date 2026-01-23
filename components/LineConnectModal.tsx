
import React, { useState } from 'react';
import { X, MessageCircle, Send, AlertTriangle, CheckCircle2, Server, Lock } from 'lucide-react';
import { lineService } from '../services/lineService';

interface LineConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LineConnectModal: React.FC<LineConnectModalProps> = ({ isOpen, onClose }) => {
  const [testMessage, setTestMessage] = useState('สวัสดีครับพี่อุ๊ก! เจเชื่อมต่อ LINE เรียบร้อยแล้วครับ 🚀');
  const [status, setStatus] = useState<'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');

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
            setErrorMessage('HTML response received. Please test on Vercel deployment.');
        } else {
            setErrorMessage(error.message || 'Failed to send message.');
        }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="bg-[#06C755] px-6 py-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2 font-bold">
                <MessageCircle className="w-6 h-6 fill-white" />
                <span>LINE Integration</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        <div className="p-6 space-y-6">
            
            {/* Configuration Status */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-200 rounded-lg text-slate-500">
                        <Lock className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800">Secure Configuration</h4>
                        <p className="mt-1 text-xs">
                            Messages will be sent to the user defined in Vercel Environment Variable:
                            <code className="block mt-1 bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">LINE_USER_ID</code>
                        </p>
                    </div>
                </div>
            </div>

            {/* Test Message Area */}
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Test Message
                </label>
                <textarea 
                    rows={3}
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none resize-none"
                />
            </div>

            {/* Status Feedback */}
            {status === 'SUCCESS' && (
                <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Message sent successfully!</span>
                </div>
            )}
            
            {status === 'ERROR' && (
                <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                </div>
            )}

            <button 
                onClick={handleTestSend}
                disabled={status === 'SENDING'}
                className="w-full py-3 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {status === 'SENDING' ? 'Sending...' : 'Test Connection'}
                {!status.includes('SENDING') && <Send className="w-4 h-4" />}
            </button>
            
            <p className="text-center text-[10px] text-slate-400">
                <Server className="w-3 h-3 inline-block mr-1" />
                Runs on Vercel Serverless Functions
            </p>
        </div>

      </div>
    </div>
  );
};
