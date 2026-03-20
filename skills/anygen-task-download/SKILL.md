---
name: anygen-task-download
version: 1.0.0
description: "AnyGen: Download artifacts from a completed task."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
  install:
    - id: node
      kind: node
      package: "@anygen/cli"
      bins: ["anygen"]
  cliHelp: "anygen task +download --help"
---

# task +download

> **PREREQUISITE:** Read [`../anygen-shared/SKILL.md`](../anygen-shared/SKILL.md) for auth, global flags, and security rules.

Download artifacts from a completed task.

## Usage

```bash
anygen task +download --task-id <id> --output-dir <dir>
```

## Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--task-id` | ✓ | Task ID |
| `--output-dir` | — | Local directory to save files (default: current directory) |
| `--thumbnail` | — | Download thumbnail image instead of main file |

## Examples

```bash
# Download main file
anygen task +download --task-id xxx

# Download thumbnail (for preview)
anygen task +download --task-id xxx --thumbnail

# Specify output directory
anygen task +download --task-id xxx --output-dir ./output
```

## Tips

- The task must be in `completed` state. Use `task get --wait` first if needed.
- Use `--thumbnail` first to show a preview, then download the main file when user requests it.
- For smart_draw tasks, the main file is automatically rendered to PNG.

> [!CAUTION]
> This is a **write** command (writes files to disk) — confirm the output directory with the user.

## See Also

- [`anygen-workflow-generate`](../anygen-workflow-generate/SKILL.md) — Full content generation workflow
