# Heartbeat Contract

## Purpose
Heartbeat คือการตรวจสุขภาพระบบประจำวัน เพื่อจับปัญหาก่อนผู้ใช้เจอผลกระทบ

## Checks (Default)
1. `daily_summary_freshness`
- PASS: มี `memory_summaries` แบบ `DAILY` สำหรับวันปัจจุบัน (timezone ผู้ใช้)
- WARN: ยังไม่มี summary วันนี้

2. `agent_run_failures_24h`
- PASS: failed runs = 0
- WARN: failed runs > 0

3. `agent_run_stuck`
- PASS: ไม่มี run `STARTED` ค้างเกิน 15 นาที
- WARN: มี run ค้าง

4. `overdue_tasks`
- PASS: งาน overdue <= 10
- WARN: งาน overdue > 10

5. `triage_backlog`
- PASS: triage pending <= 15
- WARN: triage pending > 15

## Outputs
- Markdown report: `memory/heartbeat/heartbeat-YYYY-MM-DD.md`
- JSON summary ผ่าน API cron response

## Automation Endpoints
- `POST /api/cron-agent-daily` : trigger daily brief run
- `POST /api/cron-heartbeat` : generate heartbeat report

Both endpoints require `CRON_SECRET` via `x-cron-key` header or `?key=...`.

## Optional Notifications
- If `HEARTBEAT_PUSH_LINE=true` and LINE secrets are configured, push heartbeat summary to LINE.

## Approval Gates
- If `ENABLE_APPROVAL_GATES=true`, risky LINE automation actions are blocked and marked `PENDING_APPROVAL`.
- If `APPROVAL_SECRET` is set, force run (`/api/agent-daily` with `force=true`) requires `x-approval-key`.
