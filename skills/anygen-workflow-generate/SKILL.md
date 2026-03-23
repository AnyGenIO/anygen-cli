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

## Steps

1. **Upload reference files** (optional, confirm with user first):
   `anygen file upload --data '{"file":"./data.csv"}'`
   → Save `file_token` for step 3. Tell user the file was uploaded.

2. **Gather requirements** (optional, for unclear requirements):
   `anygen task prepare --data '{"operation":"slide","messages":[{"role":"user","content":"Make a Q4 report PPT"}]}'`
   Present `reply` to user, collect their answer, then call again with `prepare_session_id` and updated `messages`:
   `anygen task prepare --data '{"operation":"slide","prepare_session_id":"<id>","messages":[...previous messages...,{"role":"user","content":"user's answer"}]}'`
   Repeat until `status=ready`. Use `suggested_task_params.prompt` in step 3.
   → When ready, show the suggested outline and confirm before proceeding.

3. **Create task**:
   `anygen task create --data '{"operation":"slide","prompt":"..."}'`
   → Tell user the task is created, share `task_url` and estimated time.

4. **Wait & deliver**:
   `anygen task get --params '{"task_id":"<id>"}' --wait` (long-running, run in background)
   `anygen task +download --task-id <id> --thumbnail`
   → Send thumbnail preview with `task_url`. Ask user if they want to request changes or download the file.

5. **Download** (on user request):
   `anygen task +download --task-id <id>`
   → Send the downloaded file to user.

6. **Modify** (on user request):
   `anygen task message send --params '{"task_id":"<id>"}' --data '{"content":"..."}'`
   `anygen task message list --params '{"task_id":"<id>"}' --wait` (long-running, run in background)
   → Repeat step 4 to show updated preview. All modifications reuse the same task.

## Tips

- Run `anygen task operations` to discover supported operation types, estimated times, export formats, and thumbnail availability.
- Run `anygen schema <resource.method>` to check required params and response format before calling any method.
- Always show thumbnail preview if available. List all output files and ask if user wants to download.
- Long-running commands (`--wait`) should be run in the background or delegated to a sub-agent to avoid blocking.

## See Also

- [`anygen-task-download`](../anygen-task-download/SKILL.md) — Download artifacts from a completed task
