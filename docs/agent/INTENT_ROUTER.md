# Intent Router Spec

## Purpose
Use a single intent router for all inbound chat channels (Web widget and Telegram) so behavior is consistent.

## Input
- `source`: `WEB` or `TELEGRAM`
- `message`: raw user text
- `context_packet`: compact DB snapshot (areas, projects, recent tasks, resources, accounts, modules)
- `dedup_hints`: exact-message and URL-link duplicate signals

## Output Contract
- `intent`
- `confidence` (0..1)
- `isActionable` (boolean)
- `operation` (`CHAT`, `CREATE`, `TRANSACTION`, `MODULE_ITEM`, `COMPLETE`)
- `chatResponse` (Thai short response)
- optional action fields (`type`, `title`, `relatedItemId`, `relatedProjectTitle`, `relatedAreaTitle`, etc.)

## Intent Labels
- `CHITCHAT`: social/small talk; no write
- `ACTIONABLE_NOTE`: note with clear follow-up; usually `CREATE`
- `PROJECT_IDEA`: new initiative; create `Project` or `Task` under project
- `TASK_CAPTURE`: explicit task; create `Task`
- `RESOURCE_CAPTURE`: knowledge/link/reference; create `Resource`
- `FINANCE_CAPTURE`: money/income/expense; create `Transaction`
- `COMPLETE_TASK`: completion intent; update task completion
- `MODULE_CAPTURE`: custom module entry

## Decision Rules
1. If message has no actionable request, return `CHITCHAT` + `CHAT`.
2. If actionable but duplicate score is high, return `CHAT` with duplicate warning.
3. Prefer `TASK_CAPTURE` over `PROJECT_IDEA` when user asks for next action.
4. For URL-heavy notes without explicit action, prefer `RESOURCE_CAPTURE`.
5. Keep confidence conservative. If uncertain, return `ACTIONABLE_NOTE` with `CHAT`.
