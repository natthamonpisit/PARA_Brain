import React from 'react';
import { AppModule, ModuleItem } from '../types';
import { MoreHorizontal, Calendar, Tag, Box, Heart, Activity, Book, Briefcase, Calculator, Smartphone, Settings } from 'lucide-react';

interface DynamicModuleBoardProps {
  module: AppModule;
  items: ModuleItem[];
  onDelete: (id: string) => void;
}

// Icon Helper
export const getModuleIcon = (iconName: string, className = "w-5 h-5") => {
  const icons: Record<string, any> = { Box, Heart, Activity, Book, Briefcase, Calculator, Smartphone, Calendar, Settings };
  const Icon = icons[iconName] || Box;
  return <Icon className={className} />;
};

export const DynamicModuleBoard: React.FC<DynamicModuleBoardProps> = ({ module, items, onDelete }) => {
  if (items.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-slate-400">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                  {getModuleIcon(module.icon, "w-8 h-8")}
              </div>
              <p className="text-lg font-medium">No {module.name} entries yet</p>
              <p className="text-sm">Click "+ New Item" to add data.</p>
          </div>
      );
  }

  return (
    <div className="pb-32 animate-in fade-in duration-500">
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {items.map(item => (
               <div key={item.id} className="group bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all duration-300 relative">
                   <div className="flex justify-between items-start mb-3">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded">
                           {new Date(item.createdAt).toLocaleDateString()}
                       </span>
                       <button 
                          onClick={() => onDelete(item.id)}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                   </div>
                   
                   <h3 className="text-lg font-bold text-slate-900 mb-4">{item.title}</h3>
                   
                   <div className="space-y-2">
                       {module.schemaConfig.fields.map(field => {
                           const value = item.data[field.key];
                           if (value === undefined || value === null || value === '') return null;
                           
                           return (
                               <div key={field.key} className="flex justify-between items-center text-sm border-b border-slate-50 pb-1 last:border-0">
                                   <span className="text-slate-500 font-medium">{field.label}</span>
                                   <span className="text-slate-800 font-semibold truncate max-w-[60%]">
                                       {String(value)}
                                   </span>
                               </div>
                           );
                       })}
                   </div>

               </div>
           ))}
       </div>
    </div>
  );
};