
# 🧠 JAY'S LIFE OS - ARCHITECTURE & PHILOSOPHY MANUAL

> "This isn't just a To-Do list. It's a second brain that remembers context."

## 1. Core Philosophy (The "Why")
Most productivity apps fail because they are dumb containers. They don't know *context*.
- **PARA Method:** We categorize life into Projects (Goals), Areas (Ongoing), Resources (Interests), and Archives.
- **Unified Life Data:** Finance, Health, and Tasks shouldn't live in separate apps. They effect each other.
- **Context Injection:** The AI (Jay) is smart only because we feed it the *state of the user's life* (current balance, active projects, past summaries) before every answer.

## 2. System Architecture

### Frontend-Heavy (Brain in the Browser)
- **Tech:** React + Vite + Tailwind.
- **Logic:** `App.tsx` acts as the router and state orchestrator.
- **State:** We use custom hooks (`useParaData`, `useFinanceData`) to manage state, acting as a local store that syncs to DB.

### Database (Supabase)
We use a **Hybrid Schema**:
1.  **Structured Core:** `projects`, `tasks`, `transactions`, `accounts` are strongly typed SQL tables.
2.  **Flexible Schema:** `modules` and `module_items` use JSONB-like structures to allow the user to build *any* new app (e.g., Book Tracker, Sleep Log) without changing the code.
3.  **Memory Store:** `daily_summaries` and `history` tables act as the Long-term Memory (LTM).

### The AI Engine (`geminiService.ts`)
This is the secret sauce. We don't just call the API.
1.  **Context Gathering:** Before sending a prompt, we fetch:
    - Last 7 days of summaries.
    - Active Projects.
    - Current Bank Balance.
    - Dynamic Module Schemas.
2.  **Structured Output:** We force Gemini to output JSON via `responseSchema`. We rarely parse raw text.
3.  **Operation Dispatcher:** The JSON result tells the frontend *what to do* (`CREATE`, `TRANSACTION`, `COMPLETE`), effectively turning natural language into executable code.

## 3. The Memory System (How Jay "Remembers")

### Short-term Memory (Working Context)
- Lives in `useAIChat.ts`.
- It holds the current conversation + data injected into the prompt.

### Long-term Memory (LTM)
- **The Trigger:** `useAIChat.ts` -> `useEffect` checks if a summary exists for "Yesterday" on app load.
- **The Action:** If missing, it silently fetches yesterday's logs -> asks AI to summarize -> saves to `daily_summaries`.
- **The Retrieval:** `geminiService.ts` injects these summaries into the system prompt so Jay knows "Yesterday you were feeling sick" or "You finished the big project".

## 4. Platform Engine (Dynamic Modules)
- We built a "No-Code" builder inside the app (`ModuleBuilderModal`).
- **Data Structure:** 
  - `modules`: Defines the schema (fields, types, icons).
  - `module_items`: Stores the actual data in a `data` JSONB column.
- **AI Integration:** The AI prompt is dynamically updated with these schemas, so Jay knows how to "Log my weight" without hardcoding.

## 5. Telegram Integration (Serverless)
- **Files:** `api/telegram-webhook.ts` and `api/telegram-push.ts`.
- **Logic:** Uses Vercel Serverless Functions.
- **Flow:** Telegram Webhook -> Vercel Function -> Supabase (Locking/Logging) -> Gemini (Thinking) -> Supabase (Action) -> Telegram Reply.
- **Security:** Checks `TELEGRAM_USER_ID` and optional `TELEGRAM_WEBHOOK_SECRET`.

---
*Maintained by: Jay (AI Agent)*
