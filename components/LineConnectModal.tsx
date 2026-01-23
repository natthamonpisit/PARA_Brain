
import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Send, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { lineService } from '../services/lineService';

interface LineConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LineConnectModal: React.FC<LineConnectModalProps> = ({ isOpen, onClose }) => {
  const [userId, setUserId] = useState('');
  const [testMessage, setTestMessage] = useState('สวัสดีครับพี่อุ๊ก! เจเชื่อมต่อ LINE เรียบร้อยแล้วครับ 🚀');
  const [status, setStatus] = useState<'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const savedId = localStorage.getItem('line_user_id');
    if (savedId) setUserId(savedId);
  }, [isOpen]);

  const handleSaveId = () => {
    localStorage.setItem('line_user_id', userId);
    setStatus('IDLE');
  };

  const handleTestSend = async () => {
    if (!userId) return;
    setStatus('SENDING');
    setErrorMessage('');
    
    try {
        handleSaveId();
        await lineService.sendPushMessage(userId, testMessage);
        setStatus('SUCCESS');
    } catch (error: any) {
        console.error(error);
        setStatus('ERROR');
        setErrorMessage(error.message || 'Failed to invoke Supabase Function. Have you deployed "line-push"?');
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
            
            {/* Context Info */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <p>
                        <span className="font-bold text-slate-800">Server-Side Only:</span> 
                        <br/>
                        Channel Secret & Access Token must be stored in Supabase Edge Function Secrets, not here.
                    </p>
                </div>
            </div>

            {/* Input User ID */}
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Your LINE User ID (Uxxxxxxxx...)
                </label>
                <input 
                    type="text" 
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="U1234567890..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Found in LINE Developers Console or via Webhook.</p>
            </div>

            {/* Test Message Area */}
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Test Message
                </label>
                <textarea 
                    rows={2}
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#06C755]/20 focus:border-[#06C755] outline-none resize-none"
                />
            </div>

            {/* Status Feedback */}
            {status === 'SUCCESS' && (
                <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Message sent successfully!</span>
                </div>
            )}
            
            {status === 'ERROR' && (
                <div className="flex items-start gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                </div>
            )}

            <button 
                onClick={handleTestSend}
                disabled={!userId || status === 'SENDING'}
                className="w-full py-3 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {status === 'SENDING' ? 'Sending...' : 'Test Connection'}
                {!status.includes('SENDING') && <Send className="w-4 h-4" />}
            </button>
        </div>

      </div>
    </div>
  );
};
