// ─── moduleDb ─────────────────────────────────────────────────────────────────
// Dynamic modules and module items CRUD.

import { AppModule, ModuleItem } from '../../types';
import { supabase } from '../supabase';

export const moduleDb = {
  async getModules(): Promise<AppModule[]> {
    const { data, error } = await supabase.from('modules').select('*').order('created_at');
    if (error) return [];
    return data.map((row: any): AppModule => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      icon: row.icon,
      schemaConfig: row.schema_config
    }));
  },

  async createModule(module: AppModule): Promise<void> {
    const { error } = await supabase.from('modules').insert({
      id: module.id,
      key: module.key,
      name: module.name,
      description: module.description,
      icon: module.icon,
      schema_config: module.schemaConfig
    });
    if (error) throw new Error(error.message);
  },

  async getModuleItems(moduleId: string): Promise<ModuleItem[]> {
    const { data, error } = await supabase
      .from('module_items')
      .select('*')
      .eq('module_id', moduleId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data.map((row: any): ModuleItem => ({
      id: row.id,
      moduleId: row.module_id,
      title: row.title,
      data: row.data,
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  },

  async addModuleItem(item: ModuleItem): Promise<void> {
    const { error } = await supabase.from('module_items').insert({
      id: item.id,
      module_id: item.moduleId,
      title: item.title,
      data: item.data,
      tags: item.tags
    });
    if (error) throw new Error(error.message);
  },

  async deleteModuleItem(id: string): Promise<void> {
    const { error } = await supabase.from('module_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
};
