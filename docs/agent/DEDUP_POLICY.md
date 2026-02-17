# Dedup Policy

## Goal
Prevent duplicate tasks/projects/resources when the same idea is captured from different channels.

## Signals
1. Exact message duplicate (same normalized `user_message` in `system_logs`)
2. Link duplicate (same URL already appears in `resources/tasks/projects` content)
3. Semantic duplicate via vector retrieval (`match_memory_chunks` with message embedding)

## Decision Thresholds
- High confidence duplicate:
  - exact message match, or
  - same URL + same topic
  - => skip create, respond with duplicate acknowledgement
- Medium confidence:
  - semantic overlap but different URL/context
  - => ask short confirmation or create as sub-task
- Low confidence:
  - create normally

## Semantic Threshold
- Default semantic duplicate threshold: `0.90`
- Configurable by env: `CAPTURE_SEMANTIC_DEDUP_THRESHOLD`

## Idempotency
- Telegram: use `update_id` as `event_id`
- Web: generate deterministic event ids when available from client
- If `event_id` already exists in `system_logs`, ignore re-processing

## Response Style
When skipping duplicates, assistant should:
1. Explain briefly why it was considered duplicate
2. Point to matched item title/id if available
3. Offer next action (update existing item instead)
