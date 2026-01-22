import { ParaItem } from '../types';

// JAY'S NOTE: Database Configuration
// ใช้ IndexedDB แบบ Native เพื่อ performance สูงสุดและไม่ต้องลง lib เพิ่ม
const DB_NAME = 'ParaBrainDB';
const STORE_NAME = 'items';
const DB_VERSION = 1;

export const db = {
  // เปิด Connection ไปยัง Database
  async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // สร้าง Object Store โดยใช้ 'id' เป็น Primary Key
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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

  // ดึงข้อมูลทั้งหมดออกมา
  async getAll(): Promise<ParaItem[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // เพิ่มข้อมูลใหม่
  async add(item: ParaItem): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // ลบข้อมูล
  async delete(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // JAY'S NOTE: ฟังก์ชันสำหรับล้างข้อมูลเก่าทั้งหมด (ใช้ตอน Restore Backup)
  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  },

  // JAY'S NOTE: ฟังก์ชันสำหรับใส่ข้อมูลทีละเยอะๆ (Bulk Import)
  async bulkAdd(items: ParaItem[]): Promise<void> {
      const db = await this.open();
      return new Promise((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          
          let successCount = 0;
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);

          items.forEach(item => {
              store.add(item);
          });
      });
  },
  
  // Helper สำหรับใส่ Mock Data ถ้าเปิด App ครั้งแรก
  async seedIfEmpty(initialItems: ParaItem[]): Promise<ParaItem[]> {
      const current = await this.getAll();
      if (current.length === 0) {
          await this.bulkAdd(initialItems); // Reuse bulkAdd
          return initialItems;
      }
      return current;
  }
};
