# AnyGen CLI

[AnyGen](https://www.anygen.io) AI 内容生成平台的命令行工具。支持幻灯片/PPT、文档、图表、网站、数据分析、研究报告、绘本、财务分析、图片设计。

## 特性

- **Discovery 驱动**：自动从服务端获取 API Schema，命令始终与最新 API 保持同步
- **L3 组合命令**：`task +run` 和 `message +chat` 将多个 API 调用合并为单一工作流
- **Agent Skills**：生成 SKILL.md 文件供 AI Agent 平台（OpenClaw、Claude Code）使用，让 Agent 能自主驱动 AnyGen
- **自动认证**：无缝的 Web 登录流程 —— 打印 URL、等待授权、自动保存密钥
- **后台友好输出**：最终结果以紧凑的 `[RESULT]` JSON 输出，适配后台执行通知的 400 字符尾部限制

## 安装

```bash
npm install -g @anygen/cli
```

需要 Node.js >= 18。

## 认证

```bash
# 交互式 Web 登录
anygen auth login

# 直接设置 API Key
anygen auth login --api-key sk-xxx

# 通过环境变量
export ANYGEN_API_KEY=sk-xxx

# 查看状态
anygen auth status

# 登出
anygen auth logout
```

## 快速开始

```bash
# 创建幻灯片并下载
anygen task +run --operation slide --prompt "Q4 季度汇报" --output-dir ./output

# 创建文档
anygen task +run --operation doc --prompt "认证系统技术设计文档" --export-format docx --output-dir ./output

# 生成图表
anygen task +run --operation smart_draw --prompt "微服务架构图" --output-dir ./output

# 修改已有任务
anygen message +chat --task-id <id> --content "把标题改成概述"
```

## 命令

### 组合命令 (L3)

将多个 API 调用合并为单一阻塞式工作流：

| 命令 | 说明 |
|------|------|
| `anygen task +run` | 创建任务 → 轮询等待完成 → 下载输出 |
| `anygen message +chat` | 发送修改消息 → 轮询等待完成 |

**task +run 参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `--operation` | 是 | 操作类型（slide、doc、smart_draw 等） |
| `--prompt` | 是 | 任务描述 |
| `--file-tokens` | — | 文件 token（JSON 数组，来自 `file upload`） |
| `--export-format` | — | 导出格式（docx、drawio、excalidraw） |
| `--output-dir` | — | 下载输出文件到本地目录 |
| `--timeout` | — | 轮询超时时间（毫秒） |

**message +chat 参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `--task-id` | 是 | 要修改的任务 ID |
| `--content` | 是 | 修改消息 |
| `--file-tokens` | — | 文件 token（JSON 数组，来自 `file upload`） |
| `--timeout` | — | 轮询超时时间（毫秒） |

### 动态命令

所有 API 资源和方法通过 Discovery Document 自动注册：

```bash
# 查看资源列表
anygen --help

# 调用任意 API 方法
anygen task create --params '{"operation":"slide","prompt":"Q4 deck"}'
anygen task get --params '{"task_id":"xxx"}'
anygen file upload --file ./data.csv

# 查看方法 Schema
anygen schema task.create
```

### 静态命令

| 命令 | 说明 |
|------|------|
| `anygen auth login` | 通过 Web 登录或 API Key 认证 |
| `anygen auth status` | 查看当前认证状态 |
| `anygen auth logout` | 移除已存储的 API Key |
| `anygen skill install` | 安装 Agent Skills 到平台 |
| `anygen skill list` | 列出可用的 Skill 操作 |

## 支持的操作

| 操作 | 类型 | 导出格式 | 耗时 |
|------|------|----------|------|
| `slide` | 幻灯片 / PPT | — | 10-15 分钟 |
| `doc` | 文档 / DOCX | docx | 10-15 分钟 |
| `smart_draw` | 图表（SmartDraw） | drawio | 30-60 秒 |
| `deep_research` | 深度研究报告 | — | 10-20 分钟 |
| `data_analysis` | 数据分析（CSV） | — | 10-15 分钟 |
| `finance` | 财务研究 | — | 10-15 分钟 |
| `storybook` | 绘本 / 创意视觉 | — | 10-15 分钟 |
| `website` | 网站 | — | 10-15 分钟 |
| `ai_designer` | 图片设计 | — | 5-10 分钟 |

## Agent Skills

AnyGen CLI 可以生成 SKILL.md 文件供 AI Agent 平台使用。这些文件指导 Agent 如何使用 AnyGen —— 包括认证、需求收集、任务创建和修改。

```bash
# 安装到 OpenClaw（默认）
anygen skill install --platform openclaw

# 安装到 Claude Code
anygen skill install --platform claude-code

# 只安装特定 Skill
anygen skill install --name slide-generator,doc-generator

# 安装到自定义目录
anygen skill install --dir ./my-skills

# 列出可用 Skill
anygen skill list
```

### 生成的 Skills

| Skill | 说明 |
|-------|------|
| `anygen` | 主路由 Skill —— 根据用户请求匹配操作类型 |
| `anygen-slide-generator` | 幻灯片 / PPT 生成 |
| `anygen-doc-generator` | 文档 / DOCX 生成 |
| `anygen-diagram-generator` | 图表生成（SmartDraw） |
| `anygen-deep-research` | 深度研究报告 |
| `anygen-data-analysis` | CSV 数据分析 |
| `anygen-financial-research` | 财务研究 |
| `anygen-storybook-generator` | 绘本 / 创意视觉 |
| `anygen-website-generator` | 网站生成 |
| `anygen-image-generator` | 图片设计 |

## 架构

```
src/
├── index.ts              # 入口，两阶段启动
├── version.ts            # CLI 版本常量
├── api/
│   ├── client.ts         # HTTP 客户端
│   └── auth.ts           # 认证流程（验证、Web 登录、轮询）
├── commands/
│   ├── auth-cmd.ts       # auth login/status/logout
│   ├── dynamic.ts        # Discovery 驱动的命令注册
│   ├── task-run.ts       # L3: task +run
│   ├── message-modify.ts # L3: message +chat
│   ├── poll.ts           # 任务/消息轮询工具
│   ├── result.ts         # 后台友好的结果输出
│   ├── skill-cmd.ts      # skill install/list
│   └── render-cmd.ts     # 图表渲染辅助
├── config/
│   └── config.ts         # 配置加载（flag > env > file）
├── discovery/
│   ├── client.ts         # Discovery Document 获取 + 缓存
│   └── types.ts          # Discovery Document 类型定义
├── render/
│   └── diagram.ts        # drawio/excalidraw → PNG 渲染
├── security/
│   ├── sanitize.ts       # 响应清洗
│   └── validate.ts       # URL/路径/文件名校验
└── skills/
    ├── generator.ts      # SKILL.md 文件生成器
    └── operations.ts     # 操作定义（9 种类型）
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev -- task +run --operation slide --prompt "测试"

# 类型检查
npm run typecheck

# Lint
npm run lint

# 运行测试
npm test

# 构建
npm run build

# 重新生成 Skill 文件
npx tsx src/index.ts skill generate --output skills
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ANYGEN_API_KEY` | 认证用的 API Key |

## License

MIT
