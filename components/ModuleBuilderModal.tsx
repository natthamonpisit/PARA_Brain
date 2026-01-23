import React, { useState } from 'react';
import { AppModule, ModuleField } from '../types';
import { X, Save, Plus, Trash2, Box, Settings, Smartphone, Heart, Activity, Book, Briefcase, Calculator, Calendar } from 'lucide-react';
import { generateId } from '../utils/helpers';

interface ModuleBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (module: AppModule) => Promise<void>;
}

const AVAILABLE_ICONS = [
  { name: 'Box', icon: Box },
  { name: 'Heart', icon: Heart },
  { name: 'Activity', icon: Activity },
  { name: 'Book', icon: Book },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Calculator', icon: Calculator },
  { name: 'Smartphone', icon: Smartphone },
  { name: 'Calendar', icon: Calendar },
  { name: 'Settings', icon: Settings },
];

export const ModuleBuilderModal: React.FC<ModuleBuilderModalProps> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Box');
  const [fields, setFields] = useState<ModuleField[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field Form State
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<ModuleField['type']>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const handleAddField = () => {
    if (!newFieldLabel) return;
    const key = newFieldLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newField: ModuleField = {
      key: key,
      label: newFieldLabel,
      type: newFieldType,
      options: newFieldType === 'select' ? newFieldOptions.split(',').map(s => s.trim()) : undefined
    };
    setFields([...fields, newField]);
    setNewFieldLabel('');
    setNewFieldOptions('');
    setNewFieldType('text');
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const newModule: AppModule = {
        id: generateId(),
        key: name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: name,
        description: description,
        icon: selectedIcon,
        schemaConfig: {
          fields: fields
        }
      };
      await onSave(newModule);
      onClose();
      // Reset
      setName(''); setDescription(''); setFields([]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 overflow-hidden border border-slate-100">
        
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            Create New Module
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. Basic Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Module Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Module Name</label>
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Health Tracker" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Icon</label>
                    <div className="flex gap-2 flex-wrap">
                        {AVAILABLE_ICONS.map(({name: iconName, icon: Icon}) => (
                            <button 
                                key={iconName}
                                type="button"
                                onClick={() => setSelectedIcon(iconName)}
                                className={`p-2 rounded-lg border transition-all ${selectedIcon === iconName ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                            >
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
          </div>

          {/* 2. Field Builder */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Fields</h4>
            
            {/* Field List */}
            {fields.length > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200">
                    {fields.map((field, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                                <span className="font-semibold text-slate-700">{field.label}</span>
                                <span className="text-xs px-2 py-0.5 bg-slate-200 rounded-full text-slate-500 uppercase">{field.type}</span>
                                {field.options && <span className="text-xs text-slate-400 truncate max-w-[150px]">({field.options.join(', ')})</span>}
                            </div>
                            <button type="button" onClick={() => handleRemoveField(idx)} className="text-slate-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Field Form */}
            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
                <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-5">
                         <input type="text" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Field Label (e.g. Weight)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div className="col-span-3">
                         <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as any)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                             <option value="text">Text</option>
                             <option value="number">Number</option>
                             <option value="select">Select</option>
                             <option value="date">Date</option>
                             <option value="checkbox">Checkbox</option>
                         </select>
                    </div>
                    <div className="col-span-4 flex gap-2">
                         {newFieldType === 'select' && (
                             <input type="text" value={newFieldOptions} onChange={(e) => setNewFieldOptions(e.target.value)} placeholder="Options (comma sep)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                         )}
                         <button 
                            type="button" 
                            onClick={handleAddField}
                            disabled={!newFieldLabel}
                            className="ml-auto px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            <Plus className="w-4 h-4" />
                         </button>
                    </div>
                </div>
            </div>
          </div>

        </form>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
             <button 
                onClick={handleSubmit} 
                disabled={isSubmitting || !name}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg disabled:opacity-50"
             >
                {isSubmitting ? 'Creating...' : 'Create Module'}
             </button>
        </div>

      </div>
    </div>
  );
};