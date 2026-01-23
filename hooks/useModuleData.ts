
import { useState, useCallback } from 'react';
import { AppModule, ModuleItem } from '../types';
import { db } from '../services/db';

export const useModuleData = () => {
  const [modules, setModules] = useState<AppModule[]>([]);
  const [moduleItems, setModuleItems] = useState<Record<string, ModuleItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadModules = useCallback(async () => {
    setIsLoading(true);
    try {
      const mods = await db.getModules();
      setModules(mods);
    } catch (e) {
      console.error("Failed to load modules", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadModuleItems = useCallback(async (moduleId: string) => {
    try {
      const items = await db.getModuleItems(moduleId);
      setModuleItems(prev => ({ ...prev, [moduleId]: items }));
    } catch (e) {
      console.error("Failed to load module items", e);
    }
  }, []);

  const createModule = async (module: AppModule) => {
    await db.createModule(module);
    await loadModules();
  };

  const addModuleItem = async (item: ModuleItem) => {
    await db.addModuleItem(item);
    await loadModuleItems(item.moduleId);
  };

  const deleteModuleItem = async (id: string, moduleId: string) => {
    await db.deleteModuleItem(id);
    await loadModuleItems(moduleId);
  };

  return {
    modules,
    moduleItems,
    isLoadingModules: isLoading,
    loadModules,
    loadModuleItems,
    createModule,
    addModuleItem,
    deleteModuleItem
  };
};
