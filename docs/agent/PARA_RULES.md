# PARA Rules

## Core Model
- `Area` owns many `Project`
- `Project` owns many `Task`
- `Task` can exist under `Area` only when it is recurring/routine
- `Resource` can link to multiple Project/Area contexts

## App-Level Mapping
Because current schema is flexible (`related_item_ids`), enforce these logical rules in prompt/pipeline:
1. Avoid orphan tasks. Try to attach each task to a project id in `related_item_ids`.
2. If no project exists and user intent implies a project, create project first (or in same pipeline) and attach task.
3. Category should reflect Area theme (`Work`, `Personal Growth`, etc.).
4. Links from research notes should be preserved in `content` and tags.

## Creation Priority
1. Reuse existing area/project when semantic match is strong.
2. Create new project only if no match and user intent is clearly new.
3. Use concise titles; store long context in `content`.

## Completion Rule
- `COMPLETE` action requires target task id or strong task-title match.
- If target cannot be resolved, do not mutate DB; ask user for clarification.
