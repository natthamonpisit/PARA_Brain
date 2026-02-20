// ─── services/db.ts ───────────────────────────────────────────────────────────
// Thin re-export shim — all logic lives in services/db/*.ts sub-modules.
// Existing callers that import `{ db }` or `{ toDb, fromDb }` from this file
// continue to work without any changes.

export { db, toDb, fromDb, paraDb, financeDb, subscriptionsDb, moduleDb } from './db/index';
