# AI Routing Rules

## Purpose
- Keep PARA categorization stable even when user input is short/ambiguous.
- Combine model flexibility with deterministic business rules.
- Reduce cognitive load by auto-linking tasks/projects to the right life area.

## Source Of Truth
- Runtime rules module: `/Users/natthamonpisit/Coding/PARA_Brain/shared/routingRules.js`
- Current rules version: `2026-02-13.v1`

## Core Areas (Baseline)
1. `Career & Business`
2. `Finance & Wealth`
3. `Health & Energy`
4. `Family & Relationships`
5. `Personal Growth & Learning`
6. `Home & Life Admin`
7. `Side Projects & Experiments`

## Travel/Hiking Deterministic Routing
Priority order:
1. If user explicitly mentions a target area, do not override.
2. If travel text has family signal -> route to `Family & Relationships`.
3. If travel text has routine/fitness signal -> route to `Health & Energy`.
4. Otherwise route to `Side Projects & Experiments`.

Additional behavior:
- Add routing tags (`travel`, `family`/`health`/`outdoor`).
- Suggest a project title (`Trip: ...`) if no project provided.
- Prefer creating/linking a project before creating task.

## Where This Is Applied
- Capture pipeline (web + Telegram): `/Users/natthamonpisit/Coding/PARA_Brain/api/_lib/capturePipeline.ts`
- Daily agent context and observability metrics: `/Users/natthamonpisit/Coding/PARA_Brain/scripts/lib/agent_daily_core.mjs`
- Weekly review baseline check: `/Users/natthamonpisit/Coding/PARA_Brain/scripts/run_weekly_ops_review.mjs`

## Notes
- Rules are deterministic and auditable; model output can be overridden by these rules when needed.
- Update `ROUTING_RULES_VERSION` whenever routing logic changes.
