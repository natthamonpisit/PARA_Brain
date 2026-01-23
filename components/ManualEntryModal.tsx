import React, { useState, useEffect } from 'react';
import { ParaType, ParaItem } from '../types';
import { X, Save, Type, Tag, AlignLeft, Layout } from 'lucide-react';
import { generateId } from '../utils/helpers';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ParaItem) => Promise<void>;
  defaultType: ParaType | 'All';
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  defaultType 
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ParaType>(ParaType.TASK);
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setContent('');
      setCategory('General');
      // Set default type based on current view (default to Task if 'All')
      setType(defaultType === 'All' ? ParaType.TASK : defaultType);
    }
  }, [isOpen, defaultType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const newItem: ParaItem = {
      id: generateId(),
      title: title,
      content: content,
      type: type,
      category: category || 'General',
      tags: [], // Manual entry defaults to no tags for simplicity
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isAiGenerated: false,
      isCompleted: false,
      relatedItemIds: []
    };

    try {
      await onSave(newItem);
      onClose();
    } catch (error) {
      console.error("Failed to save manual item:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-100">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-600" />
            Add New Item
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Title Input */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
            <input 
              autoFocus
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Type className="w-3 h-3" /> Type
              </label>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value as ParaType)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-700"
              >
                {Object.values(ParaType).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Category Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Category
              </label>
              <input 
                type="text" 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Work, Health"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-700"
              />
            </div>
          </div>

          {/* Content/Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Notes (Optional)
            </label>
            <textarea 
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add more details..."
              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-700 resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className={`
                flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg transition-all
                ${!title.trim() || isSubmitting 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95'}
              `}
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Item'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};