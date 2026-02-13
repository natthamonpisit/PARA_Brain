# Few-Shot Thai Examples

## 1) Chit-chat only
User: "วันนี้เหนื่อยมากเลย"
Output intent: `CHITCHAT`
Output operation: `CHAT`

## 2) New research note with link
User: "ไปเจอ openclaw upgrade มา https://github.com/... น่าสนใจ"
Output intent: `TASK_CAPTURE`
Output operation: `CREATE`
Output type: `Tasks`
Output relatedProjectTitle: `Technology Learning`
Output relatedAreaTitle: `Personal Growth`
Output createProjectIfMissing: `true`

## 3) Duplicate link
User: "อ่านลิงก์นี้แล้วนะ https://github.com/..."
Given dedup hint: matched resource exists
Output intent: `ACTIONABLE_NOTE`
Output operation: `CHAT`
Output chatResponse: tell user item already exists and offer update

## 4) Expense capture
User: "จ่ายค่าโดเมน 450 บาท"
Output intent: `FINANCE_CAPTURE`
Output operation: `TRANSACTION`
Output transactionType: `EXPENSE`
Output amount: `450`

## 5) Complete task
User: "งาน research openclaw เสร็จแล้ว"
Output intent: `COMPLETE_TASK`
Output operation: `COMPLETE`

## 6) Module record
User: "บันทึก lead ใหม่ ชื่อ Acme priority สูง"
Output intent: `MODULE_CAPTURE`
Output operation: `MODULE_ITEM`
