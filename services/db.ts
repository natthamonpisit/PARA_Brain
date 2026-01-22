
import { ParaItem, HistoryLog } from '../types';

// JAY'S NOTE: Database Configuration
// ใช้ IndexedDB แบบ Native เพื่อ performance สูงสุดและไม่ต้องลง lib เพิ่ม
const DB_NAME = 'ParaBrainDB';
const STORE_ITEMS = 'items';
const STORE_HISTORY = 'history';
// UPDATE: Bump version to 2 to support History Store
const DB_VERSION = 2; 

export const db = {
  // เปิด Connection ไปยัง Database
  async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store 1: Items (Main Data)
        if (!db.objectStoreNames.contains(STORE_ITEMS)) {
          db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        }

        // Store 2: History (Logs) - New in v2
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
           const historyStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
           // Index for faster sorting by time
           historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  },

  // --- ITEMS OPERATIONS ---

  async getAll(): Promise<ParaItem[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ITEMS, 'readonly');
      const store = transaction.objectStore(STORE_ITEMS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async add(item: ParaItem): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ITEMS, 'readwrite');
      const store = transaction.objectStore(STORE_ITEMS);
      // JAY'S FIX: ใช้ put แทน add เพื่อให้ Update ข้อมูลทับตัวเดิมได้ (Upsert)
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ITEMS, 'readwrite');
      const store = transaction.objectStore(STORE_ITEMS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ITEMS, STORE_HISTORY], 'readwrite');
        
        const store1 = transaction.objectStore(STORE_ITEMS);
        store1.clear();
        
        const store2 = transaction.objectStore(STORE_HISTORY);
        store2.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
  },

  async bulkAdd(items: ParaItem[]): Promise<void> {
      const db = await this.open();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_ITEMS, 'readwrite');
          const store = transaction.objectStore(STORE_ITEMS);
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);

          items.forEach(item => {
              // JAY'S FIX: ใช้ put ใน bulkAdd ด้วยเพื่อความชัวร์เวลา Import ไฟล์ทับ
              store.put(item);
          });
      });
  },
  
  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
      const current = await this.getAll();
      if (current.length === 0) {
          await this.bulkAdd(initialItems); 
          return initialItems;
      }
      return current;
  },

  // --- HISTORY OPERATIONS ---

  async addLog(log: HistoryLog): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_HISTORY, 'readwrite');
      const store = transaction.objectStore(STORE_HISTORY);
      const request = store.add(log); // Log ใช้ add ได้ เพราะ ID ไม่ซ้ำแน่นอน (สร้างใหม่ตลอด)
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getLogs(): Promise<HistoryLog[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_HISTORY, 'readonly');
      const store = transaction.objectStore(STORE_HISTORY);
      // Use index to get sorted data if needed, but for now getAll is fine
      // We will sort in JS for simplicity
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
};
