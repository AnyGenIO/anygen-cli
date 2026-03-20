---
name: anygen-workflow-generate
version: 1.0.0
description: "AnyGen: Generate slides, presentations, documents, diagrams, images, websites, research reports, data analysis, and more."
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

1. **Upload reference files** (optional, get user consent first): `anygen file upload --data '{"file":"./data.csv"}'`
   → Tell user file uploaded successfully, save `file_token` for step 4.

2. **Gather requirements**: call `anygen task prepare` in a loop, collect answers, repeat until `status=ready`
   → Present `reply` questions to user each round. When ready, present the suggested outline and confirm with user before proceeding.

3. **Create task**: `anygen task create --data '{"operation":"slide","prompt":"..."}'`
   → Share `task_url` and estimated time with user.

4. **Wait & deliver**: `anygen task get --params '{"task_id":"<id>"}' --wait` (use `sessions_spawn`), then `anygen task +download --task-id <id> --thumbnail`
   → Send thumbnail preview with `task_url`. Tell user they can request changes or ask to download the file.

5. **Download** (on user request): `anygen task +download --task-id <id>`
   → Send downloaded file to user.

6. **Modify** (on user request): `anygen task message send --params '{"task_id":"<id>"}' --data '{"content":"..."}'`, then `anygen task message list --params '{"task_id":"<id>"}' --wait` (use `sessions_spawn`)
   → Repeat step 4 to show updated preview. All modifications reuse the same task.

## Tips

- Run `anygen task operations` to discover supported content types, estimated times, and available outputs (thumbnail, file).
- Before calling any method, run `anygen schema <resource.method>` to check required params and response format.
- Always show the thumbnail preview to user if available. List all output file names and ask user if they need to download.
- Steps 4 and 6 (`--wait`) are long-running. Always use `sessions_spawn` to run them in the background.

## See Also

- [`anygen-task-download`](../anygen-task-download/SKILL.md) — Download artifacts from a completed task
