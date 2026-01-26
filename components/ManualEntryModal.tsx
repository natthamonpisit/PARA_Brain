
import React, { useState, useEffect, useRef } from 'react';
import { ParaType, ParaItem, FinanceAccount, Transaction, TransactionType, FinanceAccountType, AppModule, ModuleItem } from '../types';
import { X, Save, Type, Tag, AlignLeft, Layout, Banknote, Calendar, Wallet, Paperclip, Loader2, Image as ImageIcon, Folder, Layers } from 'lucide-react';
import { generateId } from '../utils/helpers';
import { getModuleIcon } from './DynamicModuleBoard';
import { db } from '../services/db';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any, mode: 'PARA' | 'TRANSACTION' | 'ACCOUNT' | 'MODULE') => Promise<void>;
  defaultType: ParaType | 'Finance' | 'All' | string; // string can be module ID
  projects?: ParaItem[]; 
  accounts?: FinanceAccount[];
  activeModule?: AppModule | null; // Pass active module if applicable
  // New props for editing
  editingItem?: ParaItem | null;
  allParaItems?: ParaItem[]; // Needed to populate relation dropdowns
}

type ModalTab = 'PARA' | 'FINANCE' | 'MODULE';

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  defaultType,
  projects = [],
  accounts = [],
  activeModule = null,
  editingItem = null,
  allParaItems = []
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('PARA');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PARA STATE ---
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ParaType>(ParaType.TASK);
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Relations (New Feature)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');

  // --- FINANCE STATE ---
  const [financeMode, setFinanceMode] = useState<'TRANSACTION' | 'ACCOUNT'>('TRANSACTION');
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<TransactionType>('EXPENSE');
  const [txAccount, setTxAccount] = useState('');
  const [txProject, setTxProject] = useState('');
  const [txCategory, setTxCategory] = useState('General');
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<FinanceAccountType>('BANK');
  const [accBalance, setAccBalance] = useState('');

  // --- DYNAMIC MODULE STATE ---
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleData, setModuleData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (isOpen) {
      if (activeModule) {
          setActiveTab('MODULE');
          setModuleTitle('');
          setModuleData({});
      } else if (defaultType === 'Finance') {
        setActiveTab('FINANCE');
      } else {
        setActiveTab('PARA');
        // If editing, load data
        if (editingItem) {
            setTitle(editingItem.title);
            setType(editingItem.type);
            setCategory(editingItem.category);
            setContent(editingItem.content);
            setDueDate(editingItem.dueDate || '');
            setAttachments(editingItem.attachments || []);
            
            // Resolve Relations
            const existingRelations = editingItem.relatedItemIds || [];
            const linkedProject = allParaItems.find(i => i.type === ParaType.PROJECT && existingRelations.includes(i.id));
            const linkedArea = allParaItems.find(i => i.type === ParaType.AREA && existingRelations.includes(i.id));
            
            setSelectedProjectId(linkedProject ? linkedProject.id : '');
            setSelectedAreaId(linkedArea ? linkedArea.id : '');

        } else {
            // New Item
            const isPara = Object.values(ParaType).includes(defaultType as any);
            setType(isPara ? (defaultType as ParaType) : ParaType.TASK);
            
            // Reset forms
            setTitle(''); setContent(''); setCategory('General'); setDueDate(''); setAttachments([]);
            setSelectedProjectId(''); setSelectedAreaId('');
        }
      }
      
      // Reset Finance / Other forms if needed
      if (!editingItem) {
          setTxDesc(''); setTxAmount(''); setTxCategory('General');
          if (accounts.length > 0) setTxAccount(accounts[0].id);
          setAccName(''); setAccBalance('');
      }
    }
  }, [isOpen, defaultType, accounts, activeModule, editingItem, allParaItems]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
          const url = await db.uploadFile(file);
          setAttachments(prev => [...prev, url]);
      } catch (error) {
          console.error("Upload failed", error);
          alert("Upload failed. Make sure you created 'attachments' bucket in Supabase.");
      } finally {
          setIsUploading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
        if (activeTab === 'MODULE' && activeModule) {
            const newItem: ModuleItem = {
                id: generateId(),
                moduleId: activeModule.id,
                title: moduleTitle,
                data: moduleData,
                tags: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await onSave(newItem, 'MODULE');

        } else if (activeTab === 'PARA') {
            // Build Relation IDs
            const relatedIds: string[] = [];
            if (selectedProjectId) relatedIds.push(selectedProjectId);
            if (selectedAreaId) relatedIds.push(selectedAreaId);

            const newItem: ParaItem = {
                id: editingItem ? editingItem.id : generateId(), // Preserve ID if editing
                title, content, type,
                category: category || 'General',
                tags: editingItem ? editingItem.tags : [], 
                isAiGenerated: editingItem ? editingItem.isAiGenerated : false, 
                isCompleted: editingItem ? editingItem.isCompleted : false, 
                relatedItemIds: relatedIds,
                createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(), 
                updatedAt: new Date().toISOString(),
                dueDate: dueDate || undefined,
                attachments: attachments
            };
            await onSave(newItem, 'PARA');

        } else if (activeTab === 'FINANCE') {
            if (financeMode === 'TRANSACTION') {
                if (!txAccount) { alert('Create account first'); setIsSubmitting(false); return; }
                const amountVal = parseFloat(txAmount);
                const finalAmount = txType === 'EXPENSE' ? -Math.abs(amountVal) : Math.abs(amountVal);
                const newTx: Transaction = {
                    id: generateId(), description: txDesc, amount: finalAmount, type: txType, category: txCategory, accountId: txAccount, projectId: txProject || undefined, transactionDate: new Date().toISOString()
                };
                await onSave(newTx, 'TRANSACTION');
            } else {
                const newAcc: FinanceAccount = {
                    id: generateId(), name: accName, type: accType, balance: parseFloat(accBalance || '0'), currency: 'THB', isIncludeNetWorth: true
                };
                await onSave(newAcc, 'ACCOUNT');
            }
        }
        onClose();
    } catch (error) {
        console.error("Save failed:", error);
    } finally {
        setIsSubmitting(false);
    }
  };

  // Helper lists for dropdowns
  const availableProjects = allParaItems.filter(i => i.type === ParaType.PROJECT && i.id !== editingItem?.id);
  const availableAreas = allParaItems.filter(i => i.type === ParaType.AREA && i.id !== editingItem?.id);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div className="flex gap-2 items-center">
              {activeModule ? (
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                      {getModuleIcon(activeModule.icon, "w-5 h-5")}
                      <span>New {activeModule.name} Entry</span>
                  </div>
              ) : (
                  <>
                     {editingItem ? (
                        <span className="font-bold text-slate-700">Edit {editingItem.type.slice(0, -1)}</span>
                     ) : (
                        <>
                            <button onClick={() => setActiveTab('PARA')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'PARA' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Productivity</button>
                            <button onClick={() => setActiveTab('FINANCE')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'FINANCE' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`}>Finance</button>
                        </>
                     )}
                  </>
              )}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* --- MODULE FORM --- */}
          {activeTab === 'MODULE' && activeModule && (
              <>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Entry Title</label>
                    <input type="text" required value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500/20" placeholder={`e.g. Morning Check-in`} />
                 </div>
                 <div className="grid gap-4">
                     {activeModule.schemaConfig.fields.map(field => (
                         <div key={field.key}>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{field.label}</label>
                             {field.type === 'select' ? (
                                 <select 
                                    value={moduleData[field.key] || ''} 
                                    onChange={(e) => setModuleData({...moduleData, [field.key]: e.target.value})}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                                 >
                                     <option value="">Select...</option>
                                     {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                 </select>
                             ) : field.type === 'checkbox' ? (
                                <input 
                                    type="checkbox"
                                    checked={!!moduleData[field.key]}
                                    onChange={(e) => setModuleData({...moduleData, [field.key]: e.target.checked})}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                             ) : (
                                 <input 
                                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                    step={field.type === 'number' ? 'any' : undefined}
                                    value={moduleData[field.key] || ''} 
                                    onChange={(e) => setModuleData({...moduleData, [field.key]: e.target.value})}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                                 />
                             )}
                         </div>
                     ))}
                 </div>
              </>
          )}

          {/* --- PARA FORM --- */}
          {activeTab === 'PARA' && (
             <>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                    <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                        <select value={type} onChange={(e) => setType(e.target.value as ParaType)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                            {Object.values(ParaType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
                    </div>
                </div>
                
                {/* RELATIONS SECTION (New) */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
                    <div>
                         <label className="text-xs font-bold text-indigo-500 uppercase mb-1 flex items-center gap-1">
                             <Folder className="w-3 h-3" /> Link Project
                         </label>
                         <select 
                            value={selectedProjectId} 
                            onChange={(e) => setSelectedProjectId(e.target.value)} 
                            className="w-full px-3 py-2 bg-indigo-50/50 border border-indigo-100 rounded-xl text-sm text-slate-700 focus:ring-indigo-200"
                         >
                            <option value="">-- None --</option>
                            {availableProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                         </select>
                    </div>
                    <div>
                         <label className="text-xs font-bold text-orange-500 uppercase mb-1 flex items-center gap-1">
                             <Layers className="w-3 h-3" /> Link Area
                         </label>
                         <select 
                            value={selectedAreaId} 
                            onChange={(e) => setSelectedAreaId(e.target.value)} 
                            className="w-full px-3 py-2 bg-orange-50/50 border border-orange-100 rounded-xl text-sm text-slate-700 focus:ring-orange-200"
                         >
                            <option value="">-- None --</option>
                            {availableAreas.map(a => (
                                <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                         </select>
                    </div>
                </div>

                {type === ParaType.TASK && (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Due Date</label>
                        <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
                    </div>
                )}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
                    <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm resize-none" />
                </div>
                
                {/* ATTACHMENTS SECTION */}
                <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Attachments</label>
                     <div className="flex flex-wrap gap-2 mb-2">
                        {attachments.map((url, idx) => (
                            <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                                <img src={url} alt="attachment" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute top-0 right-0 p-1 bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                     </div>
                     <div className="flex items-center gap-2">
                         <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-600 transition-colors"
                         >
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                            {isUploading ? 'Uploading...' : 'Attach File'}
                         </button>
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileSelect}
                         />
                     </div>
                </div>
             </>
          )}

          {/* --- FINANCE FORM --- */}
          {activeTab === 'FINANCE' && (
              <>
                 <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-xl">
                     <button type="button" onClick={() => setFinanceMode('TRANSACTION')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${financeMode === 'TRANSACTION' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`}>Transaction</button>
                     <button type="button" onClick={() => setFinanceMode('ACCOUNT')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${financeMode === 'ACCOUNT' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>New Account</button>
                 </div>

                 {financeMode === 'TRANSACTION' ? (
                     <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                                <select value={txType} onChange={(e) => setTxType(e.target.value as TransactionType)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                                    <option value="EXPENSE">Expense (-)</option>
                                    <option value="INCOME">Income (+)</option>
                                    <option value="TRANSFER">Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                <input type="number" step="0.01" required value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                            <input type="text" required value={txDesc} onChange={(e) => setTxDesc(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account</label>
                                <select required value={txAccount} onChange={(e) => setTxAccount(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                                    <option value="" disabled>Select...</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.balance})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
                                <select value={txProject} onChange={(e) => setTxProject(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                                    <option value="">None</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                                </select>
                            </div>
                        </div>
                     </>
                 ) : (
                     <>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Account Name</label>
                            <input type="text" required value={accName} onChange={(e) => setAccName(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                                <select value={accType} onChange={(e) => setAccType(e.target.value as FinanceAccountType)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
                                    <option value="BANK">Bank</option>
                                    <option value="CASH">Cash</option>
                                    <option value="CREDIT">Credit</option>
                                    <option value="INVESTMENT">Invest</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Balance</label>
                                <input type="number" step="0.01" value={accBalance} onChange={(e) => setAccBalance(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono" />
                            </div>
                        </div>
                     </>
                 )}
              </>
          )}

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={isSubmitting || isUploading} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
