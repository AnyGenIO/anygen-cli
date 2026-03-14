---
name: anygen-slide-generator
version: 1.0.0
description: "Use this skill any time the user wants to create, design, or produce slide presentations — as standalone files or embedded content. This includes: pitch decks, slide decks, keynote presentations, training materials, project proposals, quarterly reviews, weekly report slides, investor pitches, product launches, team kickoffs, business plans, onboarding decks, strategy presentations, sales pitches, conference talks, and any request involving 'slides' or 'PPT'. Also trigger when: user says 做 PPT, 做个汇报, 写个演示文稿, 季度汇报, 竞品分析报告（要PPT）, 产品发布会, 培训材料, 周报. If slides, decks, or presentations need to be produced, use this skill."
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

# slide

## Authentication

If not authenticated, run `anygen auth login` in the background (see Background Execution). Once complete, proceed with the workflow.

Alternatively, set the API key directly:

```bash
export ANYGEN_API_KEY=sk-xxx
```

## Helper Commands

### task +run

Create a task, poll until completed or failed, and optionally download the output file.

```bash
anygen task +run --operation slide --prompt <text> [flags]
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--prompt` | ✓ | — | Task description / prompt |
| `--file-tokens` | — | — | File tokens from file.upload (JSON array) |
| `--export-format` | — | — | Export format (e.g. docx, drawio, excalidraw) |
| `--output-dir` | — | — | Download output file to local directory |
| `--timeout` | — | 1200000 | Polling timeout in milliseconds |

### message +chat

Send a modification message to a completed task, then poll until the modification finishes.

```bash
anygen message +chat --task-id <id> --content <text> [flags]
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--task-id` | ✓ | — | Task ID to modify |
| `--content` | ✓ | — | Modification message |
| `--file-tokens` | — | — | File tokens from file.upload (JSON array) |
| `--timeout` | — | 1200000 | Polling timeout in milliseconds |

## Discovering Commands

```bash
# Browse all resources and methods
anygen --help

# Inspect a specific method's required params, types, and defaults
anygen schema <resource>.<method>
```

## Background Execution

The following commands are blocking — always run them in the background:

| Command | Duration |
|---------|----------|
| `anygen auth login` | Until user completes web login |
| `anygen task +run` | ~10-15 minutes |
| `anygen message +chat` | 1-10 minutes |

Tell the user the operation is in progress while waiting.

**Output format:** Commands print a final `[RESULT] {...}` JSON on completion with key fields (`status`, `task_id`, `preview_url`, `thumbnail_url`, `file_path`). If the result exceeds the inline limit, it is saved to a temp file — the output will read `[RESULT] Output saved to <path>`, read that file for the full result.

## Workflow

### 1. Upload Files (if user provides reference files)

Get user consent before reading or uploading any file. Upload with `anygen file upload`.
Response includes `file_token` — reuse it if the same file was already uploaded in this conversation.

### 2. Gather Requirements

Call `anygen task prepare` in a loop. Present `reply` to user as-is (translate if needed, but do NOT rephrase or summarize). Collect the user's answer, call again with updated `history`.
Repeat until response `status=ready` with `suggested_task_params`.

### 3. Confirm with User

When `status=ready`, present the `reply` and `prompt` from `suggested_task_params` to the user as the content outline. NEVER auto-create without explicit user approval. If the user requests adjustments, call `prepare` again and re-present until approved.

### 4. Create & Wait

Run `anygen task +run --operation slide --prompt '...' --output-dir ./output` in the background.
Tell the user: the slides is being generated, and they can continue chatting.

When complete, notify the user with:
- The preview URL
- Thumbnail or preview images (if available)
- Ask if they want to download the file locally (PPTX)

### 5. Modify

Run `anygen message +chat --task-id <id> --content "..."` in the background.
When complete, share the updated preview with the user.

All modifications use the same task — do NOT create a new task.

## Tips

- Always return links using Markdown format: `[text](url)` — this allows users to click them directly.

## Security Rules

- **Never** output API keys or auth tokens directly.
- **Always** confirm with user before uploading files or creating tasks.
- **Never** upload or read any file without explicit user consent.
- Use natural language. Never expose task_id, file_token, or CLI syntax to the user.

## See Also

You can run `anygen skill list` to see all available skills, or `anygen skill install --platform <name>` to install.
