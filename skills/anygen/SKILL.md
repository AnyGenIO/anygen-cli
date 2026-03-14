---
name: anygen
version: 1.0.0
description: "AnyGen: AI-powered content generation. Supports slides/PPT, documents, diagrams, websites, data analysis, research reports, storybooks, financial analysis, images."
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

# anygen

## Authentication

If not authenticated, run `anygen auth login` in the background (see Background Execution). Once complete, proceed with the workflow.

Alternatively, set the API key directly:

```bash
export ANYGEN_API_KEY=sk-xxx
```

## Operations

Match user request to an operation based on triggers.

| Operation | Type | Export Format | Estimated Time | Triggers |
|-----------|------|--------------|----------------|----------|
| `slide` | Slide / PPT Generation | — | 10-15 minutes | pitch decks, keynotes, training materials, project proposals, quarterly reviews, investor pitches, product launches, onboarding decks, sales pitches, conference talks, 做PPT, 做个汇报, 写个演示文稿, 季度汇报, 产品发布会, 培训材料, 周报 |
| `doc` | Document / DOCX Generation | docx | 10-15 minutes | technical design docs, PRDs, competitive analysis, white papers, meeting summaries, business plans, executive summaries, SOPs, memos, 写个文档, 做个竞品调研, 写份报告, 产品需求文档, 技术方案, 项目提案, 行业分析, 会议纪要 |
| `smart_draw` | Diagram Generation (SmartDraw) | drawio | 30-60 seconds | architecture diagrams, flowcharts, mind maps, org charts, ER diagrams, sequence diagrams, class diagrams, UML, Gantt charts, wireframes, sitemaps, decision trees, 画个流程图, 做个架构图, 思维导图, 组织架构图, 系统设计图, 甘特图 |
| `deep_research` | Deep Research Report | — | 10-20 minutes | industry analysis, market sizing, competitive landscape, trend analysis, technology reviews, benchmark studies, regulatory analysis, academic surveys, 帮我调研一下, 深度分析, 行业研究, 市场规模分析, 做个研究报告 |
| `data_analysis` | Data Analysis (CSV) | — | 10-15 minutes | CSV analysis, charts, dashboards, funnel analysis, cohort analysis, KPI tracking, A/B test results, revenue breakdowns, retention analysis, 分析这组数据, 做个图表, 数据可视化, 销售分析, 漏斗分析, 做个数据报表 |
| `finance` | Financial Research | — | 10-15 minutes | earnings analysis, stock research, company valuations, DCF models, balance sheet analysis, cash flow analysis, SEC filings, M&A research, IPO analysis, 分析财报, 做个估值, 股票研究, 财务尽调, 季度财务分析 |
| `storybook` | Storybook / Creative Visuals | — | 10-15 minutes | illustrated stories, comics, children's books, picture books, graphic novels, visual tutorials, brand stories, 做个绘本, 画个故事, 做个漫画, 做个图文教程, 做个品牌故事 |
| `website` | Website Generation | — | 10-15 minutes | landing pages, product pages, portfolio sites, pricing pages, personal blogs, event pages, campaign pages, 做个网站, 建个落地页, 做个产品页, 做个活动页, 做个个人主页 |
| `ai_designer` | Image Design | — | 5-10 minutes | posters, banners, social media graphics, product mockups, logo concepts, marketing creatives, book covers, icon designs, 生成图片, 做个海报, 画个插图, 设计个banner, 做个封面, 产品效果图 |

## Helper Commands

### task +run

Create a task, poll until completed or failed, and optionally download the output file.

```bash
anygen task +run --operation <name> --prompt <text> [flags]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--operation` | ✓ | Operation type |
| `--prompt` | ✓ | Task description / prompt |
| `--file-tokens` | — | File tokens from file.upload (JSON array) |
| `--export-format` | — | Export format |
| `--output-dir` | — | Download output file to local directory |
| `--timeout` | — | Polling timeout in milliseconds |

### message +chat

Send a modification message to a completed task, then poll until the modification finishes.

```bash
anygen message +chat --task-id <id> --content <text> [flags]
```

| Flag | Required | Description |
|------|----------|-------------|
| `--task-id` | ✓ | Task ID to modify |
| `--content` | ✓ | Modification message |
| `--file-tokens` | — | File tokens from file.upload (JSON array) |
| `--timeout` | — | Polling timeout in milliseconds |

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
| `anygen task +run` | Varies by operation (see Operations table) |
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

Run `anygen task +run --operation <name> --prompt '...' --output-dir ./output` in the background.
Tell the user the content is being generated and they can continue chatting.

When complete, notify the user with:
- The preview URL
- Thumbnail or preview images (if available)
- Ask if they want to download the file locally (if available)

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
