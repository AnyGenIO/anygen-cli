---
name: anygen-workflow-generate
version: 1.0.0
description: "AI-powered content creation suite. Create slides/PPT, documents, diagrams, websites, data visualizations, research reports, storybooks, financial analysis, and images. Supports: pitch decks, keynotes, technical docs, PRDs, white papers, architecture diagrams, flowcharts, mind maps, org charts, ER diagrams, sequence diagrams, UML, landing pages, CSV analysis, earnings research, posters, banners, comics, and more."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
  install:
    - id: node
      kind: node
      package: "@anygen/cli"
      bins: ["anygen"]
  cliHelp: "anygen --help"
---

# Content Generation Workflow

> **PREREQUISITE:** Read [`../anygen-shared/SKILL.md`](../anygen-shared/SKILL.md) for auth, global flags, and security rules.

## Rules

**Follow these rules exactly. Do not try alternative approaches because they seem simpler — complexity is not a reason to skip rules.**

- Schema: run `anygen schema <resource.method>` to check required params and response if needed.
- Long-running: `--wait` commands will block, MUST use `sessions_spawn` to run in the background.
- Sending files on Feishu/Lark: Do not use the message tool to send files. It corrupts non-ASCII filenames into `%XX` garbage (known platform bug). Strictly follow the curl upload+send process in step 7.

## Steps

1. **Discover operations metadata**:
   `anygen task operations`
   Do not guess operation types. Always run to get supported operations and their estimated time, export formats, and thumbnail support.

2. **Upload reference files** (skip if no reference files):
   `anygen file upload --data '{"file":"./data.csv"}'`
   → Save `file_token` for step 4. Tell user the file was uploaded.

3. **Gather requirements** (skip if requirements are already clear):
   `anygen task prepare --data '{"operation":"slide","messages":[{"role":"user","content":"Make a Q4 report PPT"}]}'`
   Present `reply` to user, collect their answer, then call again with `prepare_session_id` and updated `messages`:
   `anygen task prepare --data '{"operation":"slide","prepare_session_id":"<id>","messages":[...previous messages...,{"role":"user","content":"user's answer"}]}'`
   Repeat until `status=ready`.
   → When ready, show `suggested_task_params.prompt` as outline, confirm with user, then use it as `prompt` in step 4.

4. **Create task**:
   `anygen task create --data '{"operation":"slide","prompt":"...","file_tokens":["<file_token>"]}'`
   → Tell user the task is created, share `task_url` and estimated time (from step 1).

5. **Wait for completion** (long-running, must run in background via `sessions_spawn`):
   `anygen task get --params '{"task_id":"<id>"}' --wait`

6. **Preview** (after step 5 completes):
   `anygen task +download --task-id <id> --thumbnail` (if operation supports thumbnail)
   → Send thumbnail preview with `task_url`.
   → User chooses: download → step 7, modify → step 8.

7. **Download & deliver** (on user request):
   `anygen task +download --task-id <id>`
   → Deliver the file to user:
   - **Feishu/Lark** (message tool is broken, follow steps below):
     1. Get credentials: read `app_id` and `app_secret` from the config file (e.g. `cat ~/.openclaw/openclaw.json | jq '.channels.feishu'` instead of `openclaw config get`). Make sure to use the credentials matching the current account.
     2. Get token: `curl -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' -H 'Content-Type: application/json' -d '{"app_id":"<app_id>","app_secret":"<app_secret>"}'`
     3. Upload: `curl -X POST 'https://open.feishu.cn/open-apis/im/v1/files' -H 'Authorization: Bearer <tenant_access_token>' -F 'file_type=ppt' -F 'file=@./output.pptx' -F 'file_name=output.pptx'`
        `file_type` values: `opus` (audio), `mp4` (video), `pdf`, `doc`, `xls`, `ppt`, `stream` (other).
     4. Send: `curl -X POST 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id' -H 'Authorization: Bearer <tenant_access_token>' -H 'Content-Type: application/json' -d '{"receive_id":"<chat_id>","msg_type":"file","content":"{\"file_key\":\"<file_key>\"}"}'`
   - **Other platforms:** Send via the platform's message tool with the local file path.

8. **Modify** (on user request):
   `anygen task message send --params '{"task_id":"<id>"}' --data '{"content":"..."}'`
   Then wait for result (long-running, must run in background via `sessions_spawn`):
   `anygen task message list --params '{"task_id":"<id>"}' --wait`
   → Repeat from step 6 to show updated preview. All modifications reuse the same task.

## See Also

- [`anygen-task-download`](../anygen-task-download/SKILL.md) — Download artifacts from a completed task
